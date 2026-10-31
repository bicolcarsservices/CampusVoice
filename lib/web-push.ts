import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = {
  title: string;
  body: string;
  url: string;
};

type StoredSubscription = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push is not configured. Set the VAPID public key, private key, and subject.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const recipients = Array.from(new Set(userIds));
  if (!recipients.length) return;

  try {
    configureWebPush();
    const admin = createAdminClient();
    const { data: activeProfiles, error: profileError } = await admin.from("profiles")
      .select("id").in("id", recipients).eq("status", "active");
    if (profileError) {
      console.error("Could not verify push notification recipients.", profileError);
      return;
    }
    const activeUserIds = (activeProfiles ?? []).map((profile) => profile.id);
    if (!activeUserIds.length) return;
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint,user_id,p256dh,auth")
      .in("user_id", activeUserIds);
    if (error) {
      console.error("Could not load push subscriptions.", error);
      return;
    }

    await Promise.all((subscriptions as StoredSubscription[]).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : null;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          if (deleteError) console.error("Could not remove an expired push subscription.", deleteError);
          return;
        }
        console.error("Could not send a web push notification.", error);
      }
    }));
  } catch (error) {
    console.error("Web Push delivery is unavailable.", error);
  }
}

export async function sendPushToAllUsers(payload: PushPayload, excludedUserIds: string[] = []) {
  try {
    configureWebPush();
    const admin = createAdminClient();
    let lastEndpoint = "";
    const batchSize = 100;

    while (true) {
      let query = admin
        .from("push_subscriptions")
        .select("endpoint,user_id,p256dh,auth")
        .order("endpoint", { ascending: true })
        .limit(batchSize);
      if (lastEndpoint) query = query.gt("endpoint", lastEndpoint);
      const { data: subscriptions, error } = await query;
      if (error) {
        console.error("Could not load push subscriptions.", error);
        return;
      }
      if (!subscriptions?.length) return;

      const { data: activeProfiles, error: profileError } = await admin.from("profiles")
        .select("id").in("id", Array.from(new Set(subscriptions.map((subscription) => subscription.user_id))))
        .eq("status", "active");
      if (profileError) {
        console.error("Could not verify push notification recipients.", profileError);
        return;
      }
      const activeUserIds = new Set((activeProfiles ?? []).map((profile) => profile.id));
      const excluded = new Set(excludedUserIds);
      await Promise.all((subscriptions as StoredSubscription[])
        .filter((subscription) => activeUserIds.has(subscription.user_id) && !excluded.has(subscription.user_id))
        .map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify(payload),
            );
          } catch (error) {
            const statusCode = typeof error === "object" && error !== null && "statusCode" in error
              ? Number(error.statusCode)
              : null;
            if (statusCode === 404 || statusCode === 410) {
              const { error: deleteError } = await admin
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", subscription.endpoint);
              if (deleteError) console.error("Could not remove an expired push subscription.", deleteError);
              return;
            }
            console.error("Could not send a web push notification.", error);
          }
        }));

      if (subscriptions.length < batchSize) return;
      lastEndpoint = subscriptions[subscriptions.length - 1].endpoint;
    }
  } catch (error) {
    console.error("Web Push delivery is unavailable.", error);
  }
}

export async function sendApprovedWallPostPush(postId: string) {
  try {
    const admin = createAdminClient();
    const { data: post, error } = await admin.from("posts")
      .select("author_id,status").eq("id", postId).maybeSingle();
    if (error) {
      console.error("Could not check the post status before sending push alerts.", error);
      return;
    }
    if (!post || post.status !== "approved") return;
    await sendPushToAllUsers({
      title: "New Freedom Wall post",
      body: "Someone shared a new post with the community.",
      url: "/wall",
    }, [post.author_id]);
  } catch (error) {
    console.error("Could not prepare the new post notification.", error);
  }
}

export async function sendDirectMessagePush(senderId: string, recipientId: string) {
  try {
    const admin = createAdminClient();
    const { data: preference, error } = await admin.from("chat_preferences")
      .select("muted")
      .eq("user_id", recipientId)
      .eq("other_user_id", senderId)
      .maybeSingle();
    if (error) {
      console.error("Could not check direct-message notification preferences.", error);
      return;
    }
    if (preference?.muted) return;
  } catch (error) {
    console.error("Could not check direct-message notification preferences.", error);
    return;
  }
  await sendPushToUsers([recipientId], {
    title: "New message",
    body: "You received a new message.",
    url: `/messages/${senderId}`,
  });
}

export async function sendGroupMessagePush(senderId: string, groupId: string) {
  try {
    const admin = createAdminClient();
    const [{ data: members, error: membersError }, { data: group, error: groupError }, { data: mutedRows, error: mutedError }] =
      await Promise.all([
        admin.from("group_chat_members").select("user_id").eq("group_id", groupId).neq("user_id", senderId),
        admin.from("group_chats").select("name").eq("id", groupId).maybeSingle(),
        admin.from("chat_preferences").select("user_id").eq("group_id", groupId).eq("muted", true),
      ]);
    if (membersError || groupError || mutedError) {
      console.error("Could not load group-message notification recipients.", membersError ?? groupError ?? mutedError);
      return;
    }
    const mutedUserIds = new Set((mutedRows ?? []).map((row) => row.user_id));
    const recipients = (members ?? []).map((member) => member.user_id).filter((userId) => !mutedUserIds.has(userId));
    await sendPushToUsers(recipients, {
      title: "New group message",
      body: `There is a new message in ${group?.name ?? "your group chat"}.`,
      url: `/messages/group/${groupId}`,
    });
  } catch (error) {
    console.error("Could not prepare group-message notifications.", error);
  }
}
