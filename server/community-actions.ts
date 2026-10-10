"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSchoolName } from "@/lib/schools";
import { parsePhpAmount } from "@/lib/wallet";

const uuidSchema = z.string().uuid();
const contentSchema = z.string().trim().min(1).max(2000);
const reasons = [
  "bullying",
  "harassment",
  "hate_speech",
  "threat",
  "sexual_content",
  "spam",
  "scam",
  "personal_information",
  "doxxing",
  "misinformation",
  "other",
] as const;

export type ActionState = { error?: string; success?: string } | null;

async function getActiveUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return { supabase, user: null, error: "Please log in and try again." };
  if (!user) return { supabase, user: null, error: "Please log in to continue." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { supabase, user: null, error: "Could not verify your account. Try again." };
  if (!profile || profile.status !== "active") {
    return { supabase, user: null, error: "Your account is not active." };
  }
  return { supabase, user, error: null };
}

export async function createPost(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to post." };

  const content = contentSchema.safeParse(formData.get("content"));
  const categoryId = formData.get("category_id");
  const schoolId = formData.get("school_id");
  const anonymous = formData.get("is_anonymous") === "true";
  if (!content.success) return { error: "Write a post of 1 to 2,000 characters." };
  if (categoryId && !uuidSchema.safeParse(categoryId).success) return { error: "Choose a valid category." };
  if (schoolId && !uuidSchema.safeParse(schoolId).success) return { error: "Choose a valid school." };

  const image = formData.get("image");
  let imagePath: string | null = null;
  if (image instanceof File && image.size > 0) {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[image.type];
    if (!extension) return { error: "Images must be JPG, PNG, or WebP." };
    if (image.size > 3 * 1024 * 1024) return { error: "Images must be 3 MB or smaller." };

    imagePath = `${result.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await result.supabase.storage
      .from("post-images")
      .upload(imagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) return { error: `Image upload failed: ${uploadError.message}` };
  }

  const { error } = await result.supabase.rpc("create_post", {
    p_content: content.data,
    p_category_id: categoryId || null,
    p_school_id: schoolId || null,
    p_is_anonymous: anonymous,
    p_image_path: imagePath,
  });
  if (error) {
    if (imagePath) {
      const { error: cleanupError } = await result.supabase.storage.from("post-images").remove([imagePath]);
      if (cleanupError) console.error("Failed to remove an unlinked post image.", cleanupError);
    }
    if (error.message.includes("DAILY_LIMIT_REACHED")) {
      return { error: "You’ve reached today’s post limit. Check Subscription for available plans." };
    }
    if (error.message.includes("ACCOUNT_NOT_ACTIVE")) return { error: "Your account is not active." };
    return { error: `Could not publish your post: ${error.message}` };
  }

  revalidatePath("/wall");
  revalidatePath("/profile");
  return { success: "Your post has been published." };
}

export async function addComment(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to comment." };

  const postId = uuidSchema.safeParse(formData.get("post_id"));
  const parentValue = formData.get("parent_id");
  const parentId = parentValue ? uuidSchema.safeParse(parentValue) : null;
  const content = z.string().trim().min(1).max(1000).safeParse(formData.get("content"));
  if (!postId.success || (parentId && !parentId.success) || !content.success) {
    return { error: "Check your comment and try again (maximum 1,000 characters)." };
  }

  const { error } = await result.supabase.from("comments").insert({
    post_id: postId.data,
    parent_id: parentId ? parentId.data : null,
    author_id: result.user.id,
    content: content.data,
  });
  if (error) return { error: `Could not add comment: ${error.message}` };

  revalidatePath("/wall");
  return { success: "Comment added." };
}

export async function reportContent(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to submit a report." };

  const postValue = formData.get("post_id");
  const commentValue = formData.get("comment_id");
  const postId = postValue ? uuidSchema.safeParse(postValue) : null;
  const commentId = commentValue ? uuidSchema.safeParse(commentValue) : null;
  const reason = z.enum(reasons).safeParse(formData.get("reason"));
  const details = z.string().trim().max(500).safeParse(formData.get("details") || "");
  if ((!postId && !commentId) || (postId && !postId.success) ||
      (commentId && !commentId.success) || (!!postValue === !!commentValue) ||
      !reason.success || !details.success) {
    return { error: "Choose a report reason and try again." };
  }

  const { error } = await result.supabase.from("reports").insert({
    reporter_id: result.user.id,
    post_id: postId?.data ?? null,
    comment_id: commentId?.data ?? null,
    reason: reason.data,
    details: details.data || null,
  });
  if (error) {
    if (error.code === "23505") return { error: "You’ve already reported this content." };
    return { error: `Could not submit report: ${error.message}` };
  }

  revalidatePath("/wall");
  return { success: "Report submitted to moderators." };
}

export async function toggleReaction(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to react." };

  const postValue = formData.get("post_id");
  const commentValue = formData.get("comment_id");
  const postId = postValue ? uuidSchema.safeParse(postValue) : null;
  const commentId = commentValue ? uuidSchema.safeParse(commentValue) : null;
  if (!!postValue === !!commentValue || (postId && !postId.success) || (commentId && !commentId.success)) {
    return { error: "That post or comment could not be found." };
  }
  const target = postId?.success
    ? { column: "post_id" as const, id: postId.data }
    : commentId?.success ? { column: "comment_id" as const, id: commentId.data } : null;
  if (!target) return { error: "That post or comment could not be found." };

  let reactionQuery = result.supabase.from("reactions").select("id,kind").eq("user_id", result.user.id);
  reactionQuery = reactionQuery.eq(target.column, target.id);
  const { data: existing, error: readError } = await reactionQuery.maybeSingle();
  if (readError) return { error: `Could not update reaction: ${readError.message}` };

  const mutation = existing
    ? await result.supabase.from("reactions").delete().eq("id", existing.id)
    : await result.supabase.from("reactions").insert({
        user_id: result.user.id,
        post_id: target.column === "post_id" ? target.id : null,
        comment_id: target.column === "comment_id" ? target.id : null,
        kind: "like",
      });
  if (mutation.error) return { error: `Could not update reaction: ${mutation.error.message}` };

  revalidatePath("/wall");
  return { success: existing ? "Reaction removed." : "Post liked." };
}

export async function createSubscriptionRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to request a subscription." };

  const planId = uuidSchema.safeParse(formData.get("plan_id"));
  if (!planId.success) return { error: "Choose a valid plan." };

  const paymentReference = z.string().trim().min(1).max(100).safeParse(formData.get("payment_reference"));
  if (!paymentReference.success) return { error: "Enter the Maya payment reference or sender name." };

  const { error } = await result.supabase.from("subscriptions").insert({
    user_id: result.user.id,
    plan_id: planId.data,
    status: "pending",
    payment_method: "maya",
    payment_reference: paymentReference.data,
  });
  if (error) {
    if (error.code === "23505") return { error: "You already have a pending subscription request." };
    return { error: `Could not submit request: ${error.message}` };
  }

  revalidatePath("/subscription");
  return { success: "Payment request sent. Your plan will activate after an administrator verifies your Maya payment." };
}

export async function startSubscriptionTrial(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to start a plan trial." };

  const planCode = z.enum(["basic", "premium"]).safeParse(formData.get("plan_code"));
  if (!planCode.success) return { error: "Choose a valid trial plan." };

  const { error } = await result.supabase.rpc("start_subscription_trial", {
    p_plan_code: planCode.data,
  });
  if (error) {
    if (error.message.includes("TRIAL_ALREADY_USED")) return { error: "The one-time 2-day trial has already been used on this account." };
    if (error.message.includes("ACTIVE_SUBSCRIPTION_EXISTS")) return { error: "You already have an active subscription." };
    if (error.message.includes("PENDING_SUBSCRIPTION_EXISTS")) return { error: "Resolve your pending subscription request before starting a trial." };
    if (error.message.includes("INVALID_TRIAL_PLAN") || error.message.includes("PLAN_NOT_FOUND")) return { error: "That trial plan is unavailable." };
    return { error: `Could not start your trial: ${error.message}` };
  }

  revalidatePath("/subscription");
  revalidatePath("/profile");
  revalidatePath("/games/galactic-striker");
  return { success: `${planCode.data === "basic" ? "Basic" : "Premium"} 2-day trial started. No payment was taken; access ends automatically after 2 days.` };
}

export async function cancelMySubscription(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to manage your subscription." };

  const subscriptionId = uuidSchema.safeParse(formData.get("subscription_id"));
  if (!subscriptionId.success) return { error: "Choose a valid subscription." };

  const { error } = await result.supabase.rpc("cancel_my_subscription", {
    p_sub: subscriptionId.data,
  });
  if (error) return { error: `Could not cancel subscription: ${error.message}` };

  revalidatePath("/subscription");
  revalidatePath("/profile");
  return { success: "Your subscription has been cancelled." };
}

export async function requestWalletTopup(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to top up your wallet." };
  const amount = parsePhpAmount(formData.get("amount_php"));
  const reference = z.string().trim().max(120).safeParse(formData.get("payment_reference") ?? "");
  if (amount === null || !reference.success) {
    return { error: "Enter an amount from ₱1 to ₱100,000 and a valid payment reference." };
  }

  const { error } = await result.supabase.rpc("request_wallet_topup", {
    p_amount_centavos: amount,
    p_payment_reference: reference.data || null,
  });
  if (error) return { error: `Could not submit top-up request: ${error.message}` };
  revalidatePath("/wallet");
  revalidatePath("/admin/wallet");
  return { success: "Top-up request sent. Your balance will update after an admin verifies the Maya payment." };
}

export async function requestWalletWithdrawal(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to request a withdrawal." };
  const amount = parsePhpAmount(formData.get("amount_php"));
  const method = z.enum(["Maya", "GCash", "Bank"]).safeParse(formData.get("payout_method"));
  const accountName = z.string().trim().min(2).max(100).safeParse(formData.get("account_name"));
  const accountNumber = z.string().trim().min(4).max(100).safeParse(formData.get("account_number"));
  if (amount === null || !method.success || !accountName.success || !accountNumber.success) {
    return { error: "Check the withdrawal amount and payout details." };
  }

  const { error } = await result.supabase.rpc("request_wallet_withdrawal", {
    p_amount_centavos: amount,
    p_payout_method: method.data,
    p_account_name: accountName.data,
    p_account_number: accountNumber.data,
  });
  if (error) {
    if (error.message.includes("INSUFFICIENT_BALANCE")) return { error: "Your wallet balance is not enough for this withdrawal." };
    return { error: `Could not submit withdrawal request: ${error.message}` };
  }
  revalidatePath("/wallet");
  revalidatePath("/admin/wallet");
  return { success: "Withdrawal request sent. The requested amount is reserved while an admin reviews and pays it." };
}

export async function cancelWalletWithdrawal(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to manage your withdrawal." };
  const requestId = uuidSchema.safeParse(formData.get("request_id"));
  if (!requestId.success) return { error: "Choose a valid withdrawal request." };

  const { error } = await result.supabase.rpc("cancel_my_wallet_withdrawal", {
    p_request: requestId.data,
  });
  if (error) return { error: `Could not cancel withdrawal: ${error.message}` };
  revalidatePath("/wallet");
  revalidatePath("/admin/wallet");
  return { success: "Withdrawal request cancelled and the reserved balance was returned." };
}

export async function updateProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to edit your profile." };

  const displayName = z.string().trim().min(2).max(60).safeParse(formData.get("display_name"));
  const username = z.string().regex(/^[a-zA-Z0-9_]{3,20}$/).safeParse(formData.get("username"));
  const schoolName = z.string().trim().max(100).safeParse(formData.get("school_name") ?? "");
  const gradeLevel = z.string().trim().max(30).safeParse(formData.get("grade_level") ?? "");
  const bio = z.string().trim().max(300).safeParse(formData.get("bio") ?? "");
  if (!displayName.success || !username.success || !schoolName.success || !gradeLevel.success || !bio.success) {
    return { error: "Check your profile fields and try again." };
  }

  const { data: schools, error: schoolsError } = schoolName.data
    ? await result.supabase.from("schools").select("id,name").eq("is_active", true)
    : { data: [], error: null };
  if (schoolsError) return { error: `Could not check the school name: ${schoolsError.message}` };
  const school = resolveSchoolName(schoolName.data, schools ?? []);

  const { data: currentProfile, error: profileError } = await result.supabase
    .from("profiles").select("avatar_path").eq("id", result.user.id).maybeSingle();
  if (profileError || !currentProfile) return { error: "Could not load your current profile." };

  const image = formData.get("avatar");
  let avatarPath = currentProfile.avatar_path;
  let newAvatarPath: string | null = null;
  if (image instanceof File && image.size > 0) {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[image.type];
    if (!extension) return { error: "Avatar must be JPG, PNG, or WebP." };
    if (image.size > 2 * 1024 * 1024) return { error: "Avatar must be 2 MB or smaller." };
    newAvatarPath = `${result.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await result.supabase.storage
      .from("avatars").upload(newAvatarPath, image, { contentType: image.type, upsert: false });
    if (uploadError) return { error: `Avatar upload failed: ${uploadError.message}` };
    avatarPath = newAvatarPath;
  } else if (formData.get("remove_avatar") === "true") {
    avatarPath = null;
  }

  const { error } = await result.supabase.from("profiles").update({
    display_name: displayName.data,
    username: username.data,
    school_id: school.schoolId,
    school_name: school.schoolName,
    grade_level: gradeLevel.data || null,
    bio: bio.data || null,
    avatar_path: avatarPath,
  }).eq("id", result.user.id);
  if (error) {
    if (newAvatarPath) {
      const { error: cleanupError } = await result.supabase.storage.from("avatars").remove([newAvatarPath]);
      if (cleanupError) console.error("Failed to remove an unlinked avatar.", cleanupError);
    }
    if (error.code === "23505") return { error: "That username is already in use." };
    return { error: `Could not update profile: ${error.message}` };
  }

  if (currentProfile.avatar_path && currentProfile.avatar_path !== avatarPath) {
    const { error: removeError } = await result.supabase.storage.from("avatars").remove([currentProfile.avatar_path]);
    if (removeError) return { error: `Profile updated, but the old avatar could not be removed: ${removeError.message}` };
  }
  revalidatePath("/profile");
  revalidatePath("/wall");
  return { success: "Profile updated." };
}

export async function deleteMyPost(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to delete a post." };
  const postId = uuidSchema.safeParse(formData.get("post_id"));
  if (!postId.success) return { error: "Invalid post." };
  const { error } = await result.supabase.rpc("delete_my_post", { p_post: postId.data });
  if (error) return { error: `Could not delete post: ${error.message}` };
  revalidatePath("/wall");
  revalidatePath("/profile");
  return { success: "Post deleted." };
}

export async function deleteMyComment(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to delete a comment." };
  const commentId = uuidSchema.safeParse(formData.get("comment_id"));
  if (!commentId.success) return { error: "Invalid comment." };
  const { error } = await result.supabase.rpc("delete_my_comment", { p_comment: commentId.data });
  if (error) return { error: `Could not delete comment: ${error.message}` };
  revalidatePath("/wall");
  return { success: "Comment deleted." };
}

export async function markNotificationRead(_: ActionState, formData: FormData): Promise<ActionState> {
  const result = await getActiveUser();
  if (!result.user) return { error: result.error ?? "Please log in to manage notifications." };
  const notificationId = uuidSchema.safeParse(formData.get("notification_id"));
  if (!notificationId.success) return { error: "Invalid notification." };
  const { error } = await result.supabase.from("notifications").update({ is_read: true })
    .eq("id", notificationId.data).eq("user_id", result.user.id);
  if (error) return { error: `Could not update notification: ${error.message}` };
  revalidatePath("/notifications");
  return { success: "Notification marked as read." };
}
