"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePhpAmount, parsePhpDeduction } from "@/lib/wallet";

const uuid = z.string().uuid();

async function getAdminClient() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, error: "Please log in with an administrator account." };
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) return { supabase, error: `Could not verify admin access: ${error.message}` };
  if (!isAdmin) return { supabase, error: "Administrator access is required." };
  return { supabase, error: null };
}

export async function adminSetPostStatus(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const postId = uuid.safeParse(formData.get("post_id"));
  const status = z.enum(["pending", "approved", "rejected", "flagged", "hidden", "removed"]).safeParse(formData.get("status"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!postId.success || !status.success || !reason.success) return { error: "Invalid moderation request." };
  const { error } = await supabase.rpc("admin_set_post_status", {
    p_post: postId.data, p_status: status.data, p_reason: reason.data || null,
  });
  if (error) return { error: `Could not update post: ${error.message}` };
  revalidatePath("/admin");
  revalidatePath("/admin/posts");
  revalidatePath("/wall");
  return { success: "Post status updated." };
}

export async function adminSetCommentStatus(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const commentId = uuid.safeParse(formData.get("comment_id"));
  const status = z.enum(["approved", "hidden", "removed"]).safeParse(formData.get("status"));
  if (!commentId.success || !status.success) return { error: "Invalid comment moderation request." };
  const { error } = await supabase.rpc("admin_set_comment_status", {
    p_comment: commentId.data, p_status: status.data, p_reason: String(formData.get("reason") ?? "").trim() || null,
  });
  if (error) return { error: `Could not update comment: ${error.message}` };
  revalidatePath("/admin/comments");
  revalidatePath("/wall");
  return { success: "Comment status updated." };
}

export async function adminSetUserStatus(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const userId = uuid.safeParse(formData.get("user_id"));
  const status = z.enum(["active", "suspended", "banned"]).safeParse(formData.get("status"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!userId.success || !status.success || !reason.success) return { error: "Invalid user moderation request." };
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId.data, p_status: status.data, p_reason: reason.data || null,
  });
  if (error) return { error: `Could not update user: ${error.message}` };
  revalidatePath("/admin/users");
  return { success: "User status updated." };
}

export async function adminResolveReport(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const reportId = uuid.safeParse(formData.get("report_id"));
  const status = z.enum(["reviewing", "resolved", "dismissed"]).safeParse(formData.get("status"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!reportId.success || !status.success || !reason.success) return { error: "Invalid report action." };
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_report: reportId.data, p_status: status.data, p_action: reason.data || null, p_reason: reason.data || null,
  });
  if (error) return { error: `Could not resolve report: ${error.message}` };
  revalidatePath("/admin/reports");
  return { success: "Report updated." };
}

export async function adminActivateSubscription(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const userId = uuid.safeParse(formData.get("user_id"));
  const requestId = uuid.safeParse(formData.get("request_id"));
  const planCode = z.enum(["basic", "premium"]).safeParse(formData.get("plan_code"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!userId.success || !requestId.success || !planCode.success || !reason.success) return { error: "Invalid subscription action." };
  const { error } = await supabase.rpc("admin_activate_subscription", {
    p_user: userId.data, p_plan_code: planCode.data,
    p_request_id: requestId.data, p_reason: reason.data || null,
  });
  if (error) return { error: `Could not activate subscription: ${error.message}` };
  revalidatePath("/admin/subscriptions");
  revalidatePath("/subscription");
  revalidatePath("/profile");
  return { success: "Subscription activated and audit-logged." };
}

export async function adminCancelSubscription(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const subscriptionId = uuid.safeParse(formData.get("subscription_id"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!subscriptionId.success || !reason.success) return { error: "Invalid subscription action." };
  const { error } = await supabase.rpc("admin_cancel_subscription", {
    p_sub: subscriptionId.data,
    p_reason: reason.data || null,
  });
  if (error) return { error: `Could not cancel subscription: ${error.message}` };
  revalidatePath("/admin/subscriptions");
  revalidatePath("/subscription");
  revalidatePath("/profile");
  return { success: "Subscription cancelled and audit-logged." };
}

export async function adminMarkPaymongoRefunded(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const subscriptionId = uuid.safeParse(formData.get("subscription_id"));
  const reason = z.string().trim().min(1).max(500).safeParse(formData.get("reason") ?? "");
  if (!subscriptionId.success || !reason.success) {
    return { error: "Confirm the refund in PayMongo and enter a verification note." };
  }
  const { error } = await supabase.rpc("admin_mark_paymongo_refunded", {
    p_sub: subscriptionId.data,
    p_reason: reason.data,
  });
  if (error) return { error: `Could not update refund status: ${error.message}` };
  revalidatePath("/admin/subscriptions");
  revalidatePath("/subscription");
  revalidatePath("/profile");
  return { success: "Refund status updated and audit-logged." };
}

export async function adminReviewWalletTopup(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const requestId = uuid.safeParse(formData.get("request_id"));
  const decision = z.enum(["approve", "reject"]).safeParse(formData.get("decision"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  const fee = decision.success && decision.data === "approve" ? parsePhpDeduction(formData.get("fee_php")) : 0;
  const received = decision.success && decision.data === "approve" ? parsePhpAmount(formData.get("received_php")) : 0;
  if (!requestId.success || !decision.success || !reason.success || fee === null || received === null) {
    return { error: "Enter the verified Maya amount received and a valid fee/deduction." };
  }
  if (decision.data === "approve" && fee > 0 && !reason.data) {
    return { error: "Add a review note explaining the fee/deduction." };
  }
  const { error } = await supabase.rpc("admin_review_wallet_topup", {
    p_request: requestId.data,
    p_approve: decision.data === "approve",
    p_reason: reason.data || null,
    p_received_centavos: received,
    p_fee_centavos: fee,
  });
  if (error) return { error: `Could not review top-up: ${error.message}` };
  revalidatePath("/admin/wallet");
  revalidatePath("/wallet");
  return { success: decision.data === "approve" ? "Top-up verified; net amount credited after the deduction." : "Top-up request rejected." };
}

export async function adminReviewGameReward(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const claimId = uuid.safeParse(formData.get("claim_id"));
  const decision = z.enum(["fulfilled", "rejected"]).safeParse(formData.get("decision"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!claimId.success || !decision.success || !reason.success ||
      (decision.data === "fulfilled" && !reason.data)) return { error: "Enter a valid game reward decision and fulfillment note." };
  const { error } = await supabase.rpc("admin_review_game_reward", {
    p_claim: claimId.data,
    p_decision: decision.data,
    p_reason: reason.data || null,
  });
  if (error) return { error: `Could not review game reward: ${error.message}` };
  revalidatePath("/admin/game-rewards");
  revalidatePath("/games/campus-coin-rush");
  return { success: decision.data === "fulfilled" ? "Reward marked as sent." : "Reward claim rejected." };
}

export async function adminReviewWalletWithdrawal(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const requestId = uuid.safeParse(formData.get("request_id"));
  const decision = z.enum(["approve", "reject", "paid"]).safeParse(formData.get("decision"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!requestId.success || !decision.success || !reason.success) return { error: "Invalid withdrawal review." };
  const { error } = await supabase.rpc("admin_review_wallet_withdrawal", {
    p_request: requestId.data,
    p_decision: decision.data,
    p_reason: reason.data || null,
  });
  if (error) return { error: `Could not update withdrawal: ${error.message}` };
  revalidatePath("/admin/wallet");
  revalidatePath("/wallet");
  return {
    success: decision.data === "paid" ? "Withdrawal marked as paid." :
      decision.data === "approve" ? "Withdrawal approved. Complete the manual payout, then mark it paid." :
        "Withdrawal rejected and balance returned.",
  };
}

export async function adminReviewGalacticConversion(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const requestId = uuid.safeParse(formData.get("request_id"));
  const decision = z.enum(["approved", "rejected"]).safeParse(formData.get("decision"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!requestId.success || !decision.success || !reason.success) return { error: "Invalid crystal conversion review." };
  const { error } = await supabase.rpc("admin_review_galactic_conversion", {
    p_request: requestId.data,
    p_decision: decision.data,
    p_reason: reason.data || null,
  });
  if (error) return { error: `Could not review crystal conversion: ${error.message}` };
  revalidatePath("/admin/galactic-striker");
  revalidatePath("/games/galactic-striker");
  return { success: decision.data === "approved" ? "Conversion approved and earnings credited." : "Conversion rejected." };
}

export async function adminReviewGalacticWithdrawal(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const requestId = uuid.safeParse(formData.get("request_id"));
  const decision = z.enum(["approve", "reject", "paid"]).safeParse(formData.get("decision"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!requestId.success || !decision.success || !reason.success ||
      (decision.data === "paid" && !reason.data)) return { error: "Enter a valid payout action and payment note." };
  const { error } = await supabase.rpc("admin_review_galactic_withdrawal", {
    p_request: requestId.data,
    p_decision: decision.data,
    p_reason: reason.data || null,
  });
  if (error) return { error: `Could not update Galactic Striker payout: ${error.message}` };
  revalidatePath("/admin/galactic-striker");
  revalidatePath("/games/galactic-striker");
  return {
    success: decision.data === "paid" ? "Payout marked as paid." :
      decision.data === "approve" ? "Payout approved. Send the net amount manually, then mark it paid." :
        "Payout rejected and earnings balance returned.",
  };
}

export async function adminSetWalletGameRate(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const gameKey = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,59}$/).safeParse(formData.get("game_key"));
  const gameName = z.string().trim().min(1).max(80).safeParse(formData.get("game_name"));
  const amount = parsePhpAmount(formData.get("price_php"));
  const period = z.coerce.number().int().min(1).max(1440).safeParse(formData.get("period_minutes"));
  const active = formData.get("is_active") === "true";
  if (!gameKey.success || !gameName.success || amount === null || !period.success) {
    return { error: "Enter a valid game key, name, price (₱1–₱100,000), and billing period (1–1,440 minutes)." };
  }
  const { error } = await supabase.rpc("admin_set_wallet_game_rate", {
    p_game_key: gameKey.data,
    p_game_name: gameName.data,
    p_price_centavos: amount,
    p_period_minutes: period.data,
    p_is_active: active,
  });
  if (error) return { error: `Could not save game rate: ${error.message}` };
  revalidatePath("/admin/wallet");
  revalidatePath("/wallet");
  return { success: "Game charge rate saved." };
}

export async function saveWebsiteSetting(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const key = z.enum(["site_name", "tagline", "free_daily_post_limit", "require_post_approval", "maintenance_mode"])
    .safeParse(formData.get("key"));
  if (!key.success) return { error: "Unknown setting." };
  let value: string | number | boolean;
  if (key.data === "free_daily_post_limit") {
    const parsed = z.coerce.number().int().min(0).max(100).safeParse(formData.get("value"));
    if (!parsed.success) return { error: "Daily limit must be between 0 and 100." };
    value = parsed.data;
  } else if (key.data === "require_post_approval" || key.data === "maintenance_mode") {
    value = formData.get("value") === "true";
  } else {
    const parsed = z.string().trim().min(1).max(120).safeParse(formData.get("value"));
    if (!parsed.success) return { error: "Enter a value up to 120 characters." };
    value = parsed.data;
  }
  const { error } = await supabase.from("website_settings").upsert({
    key: key.data, value, updated_by: (await supabase.auth.getUser()).data.user?.id,
  });
  if (error) return { error: `Could not save setting: ${error.message}` };
  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { success: "Setting saved." };
}

export async function savePlan(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const planId = uuid.safeParse(formData.get("plan_id"));
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  const description = z.string().trim().max(300).safeParse(formData.get("description") ?? "");
  const price = z.coerce.number().min(0).max(100000).safeParse(formData.get("price_php"));
  const durationValue = String(formData.get("duration_days") ?? "").trim();
  const duration = durationValue ? z.coerce.number().int().min(1).max(3650).safeParse(durationValue) : null;
  const limitValue = String(formData.get("daily_post_limit") ?? "").trim();
  const limit = limitValue ? z.coerce.number().int().min(0).max(10000).safeParse(limitValue) : null;
  const active = formData.get("is_active") === "true";
  if (!planId.success || !name.success || !description.success || !price.success ||
      (duration && !duration.success) || (limit && !limit.success)) return { error: "Check all plan values and try again." };

  const { error } = await supabase.from("subscription_plans").update({
    name: name.data,
    description: description.data || null,
    price_php: price.data,
    duration_days: duration ? duration.data : null,
    daily_post_limit: limit ? limit.data : null,
    is_active: active,
  }).eq("id", planId.data);
  if (error) return { error: `Could not save plan: ${error.message}` };
  revalidatePath("/subscription");
  revalidatePath("/admin/plans");
  return { success: "Plan saved." };
}

export async function savePlanFeature(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const planId = uuid.safeParse(formData.get("plan_id"));
  const featureIdValue = formData.get("feature_id");
  const featureId = featureIdValue ? uuid.safeParse(featureIdValue) : null;
  const label = z.string().trim().min(1).max(120).safeParse(formData.get("label"));
  const featureKeyValue = String(formData.get("feature_key") ?? "").trim();
  const featureKey = featureKeyValue ? z.string().regex(/^[a-z0-9_]{1,50}$/).safeParse(featureKeyValue) : null;
  const sortOrder = z.coerce.number().int().min(0).max(1000).safeParse(formData.get("sort_order") ?? "0");
  if (!planId.success || (featureId && !featureId.success) || !label.success ||
      (featureKey && !featureKey.success) || !sortOrder.success) return { error: "Check the feature fields and try again." };

  const values = { plan_id: planId.data, label: label.data, feature_key: featureKey?.data ?? null, sort_order: sortOrder.data };
  const mutation = featureId
    ? await supabase.from("subscription_features").update(values).eq("id", featureId.data)
    : await supabase.from("subscription_features").insert(values);
  if (mutation.error) return { error: `Could not save feature: ${mutation.error.message}` };
  revalidatePath("/admin/plans");
  revalidatePath("/subscription");
  return { success: "Plan feature saved." };
}

export async function deletePlanFeature(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const featureId = uuid.safeParse(formData.get("feature_id"));
  if (!featureId.success) return { error: "Invalid feature." };
  const { error } = await supabase.from("subscription_features").delete().eq("id", featureId.data);
  if (error) return { error: `Could not remove feature: ${error.message}` };
  revalidatePath("/admin/plans");
  revalidatePath("/subscription");
  return { success: "Feature removed." };
}

export async function saveAnnouncement(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const idValue = formData.get("id");
  const id = idValue ? uuid.safeParse(idValue) : null;
  const title = z.string().trim().min(1).max(120).safeParse(formData.get("title"));
  const body = z.string().trim().min(1).max(2000).safeParse(formData.get("body"));
  const published = formData.get("is_published") === "true";
  if ((id && !id.success) || !title.success || !body.success) return { error: "Check the announcement and try again." };

  const mutation = id
    ? await supabase.from("announcements").update({ title: title.data, body: body.data, is_published: published }).eq("id", id.data)
    : await supabase.from("announcements").insert({
        title: title.data, body: body.data, is_published: published,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
  if (mutation.error) return { error: `Could not save announcement: ${mutation.error.message}` };
  revalidatePath("/admin/announcements");
  revalidatePath("/");
  return { success: "Announcement saved." };
}

export async function deleteAnnouncement(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid announcement." };
  const { error } = await supabase.from("announcements").delete().eq("id", id.data);
  if (error) return { error: `Could not delete announcement: ${error.message}` };
  revalidatePath("/admin/announcements");
  revalidatePath("/");
  return { success: "Announcement deleted." };
}

export async function saveSchool(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const idValue = formData.get("id");
  const id = idValue ? uuid.safeParse(idValue) : null;
  const name = z.string().trim().min(2).max(120).safeParse(formData.get("name"));
  const location = z.string().trim().max(120).safeParse(formData.get("location") ?? "");
  const description = z.string().trim().max(1000).safeParse(formData.get("description") ?? "");
  const isActive = formData.get("is_active") === "true";
  if ((id && !id.success) || !name.success || !location.success || !description.success) {
    return { error: "Check the school fields and try again." };
  }
  const values = {
    name: name.data,
    location: location.data || null,
    description: description.data || null,
    is_active: isActive,
  };
  const mutation = id
    ? await supabase.from("schools").update(values).eq("id", id.data)
    : await supabase.from("schools").insert(values);
  if (mutation.error) {
    if (mutation.error.code === "23505") return { error: "A school with that name already exists." };
    return { error: `Could not save school: ${mutation.error.message}` };
  }
  revalidatePath("/admin/schools");
  revalidatePath("/schools");
  revalidatePath("/register");
  return { success: "School saved." };
}

export async function saveCategory(formData: FormData) {
  const { supabase, error: accessError } = await getAdminClient();
  if (accessError) return { error: accessError };
  const idValue = formData.get("id");
  const id = idValue ? uuid.safeParse(idValue) : null;
  const name = z.string().trim().min(2).max(80).safeParse(formData.get("name"));
  const sortOrder = z.coerce.number().int().min(0).max(1000).safeParse(formData.get("sort_order") ?? "0");
  const isActive = formData.get("is_active") === "true";
  if ((id && !id.success) || !name.success || !sortOrder.success) return { error: "Check the category fields and try again." };
  const values = { name: name.data, sort_order: sortOrder.data, is_active: isActive };
  const mutation = id
    ? await supabase.from("categories").update(values).eq("id", id.data)
    : await supabase.from("categories").insert(values);
  if (mutation.error) {
    if (mutation.error.code === "23505") return { error: "That category already exists." };
    return { error: `Could not save category: ${mutation.error.message}` };
  }
  revalidatePath("/admin/categories");
  revalidatePath("/wall");
  return { success: "Category saved." };
}
