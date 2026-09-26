// Owned by the notifications feature. Keep keys identical in ar/notifications.js and en/notifications.js.
// Sentences for grouped rows put {actors} where Arabic grammar needs the genitive
// ("إعجاب سارة و3 آخرين"), and never gender the actor (the verb agrees with the
// post or the sentence is noun-based) — we don't know members' genders.
const notifications = {
  page: {
    title: "Notifications",
    lead: "Community activity, your messages and your exam results, as they happen.",
  },
  unread: {
    zero: "No unread notifications",
    one: "{count} unread notification",
    other: "{count} unread notifications",
  },
  actions: {
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    settings: "Notification settings",
    loadMore: "Show older notifications",
    retry: "Try again",
    showNew: {
      one: "{count} new notification",
      other: "{count} new notifications",
    },
  },
  filters: {
    label: "Filter notifications",
    all: "All",
    unread: "Unread",
    mentions: "Mentions",
    exams: "Exams",
  },
  days: {
    earlier: "Earlier",
  },
  actors: {
    anonymous: "An anonymous member",
    member: "A Jazira member",
    someone: "Someone",
    two: "{name} and {name2}",
    many: {
      one: "{name} and {count} other",
      other: "{name} and {count} others",
    },
  },
  types: {
    like: "{actors} liked your post",
    repost: "{actors} reposted your post",
    comment: {
      one: "{actors} commented on your post",
      other: "{actors} left {count} comments on your post",
    },
    follow: {
      one: "{actors} started following you",
      other: "{actors} started following you",
    },
    mention: "{actors} mentioned you in a post",
    message: {
      one: "New message from {actors}",
      other: "{count} new messages from {actors}",
    },
    message_request: "Message request from {actors}",
    request_accepted: "{actors} accepted your message request",
    exam_result: {
      title: "Your {exam} result: {score}",
      titleNoScore: "Your {exam} result is ready",
      correct: {
        zero: "No correct answers out of {total}",
        one: "{count} of {total} correct",
        other: "{count} of {total} correct",
      },
      expired: "Submitted automatically when time ran out",
    },
    achievement: "You earned a new achievement",
    system: "An update from Jazira",
    unknown: "New notification",
  },
  kinds: {
    like: "Like",
    repost: "Repost",
    comment: "Comment",
    follow: "Follow",
    mention: "Mention",
    message: "Message",
    message_request: "Message request",
    request_accepted: "Request accepted",
    exam_result: "Exam result",
    achievement: "Achievement",
    system: "Jazira",
    unknown: "Notification",
  },
  exams: {
    aptitude: "Aptitude test",
    achievement: "Achievement test",
    generic: "exam",
    withSection: "{exam} ({section})",
    sections: {
      quantitative: "Quantitative",
      verbal: "Verbal",
      math: "Math",
      physics: "Physics",
      chemistry: "Chemistry",
      biology: "Biology",
    },
  },
  item: {
    unread: "Unread",
  },
  states: {
    empty: {
      title: "No notifications yet",
      body: "Likes, comments, new followers, messages and your exam results will show up here as they happen.",
      community: "Browse the community",
      exams: "Start an exam",
    },
    filtered: {
      unread: { title: "Nothing unread", body: "You've seen every notification shown here." },
      mentions: { title: "No mentions yet", body: "When someone @mentions you in a post, you'll find it here." },
      exams: { title: "No exam results yet", body: "Finish an exam and its result lands here, with a link to review your answers." },
      more: "Older notifications may have more.",
      showAll: "Show all",
    },
    end: "That's all your notifications",
    error: { title: "We couldn't load your notifications", body: "Check your internet connection and try again." },
    moreError: "We couldn't load older notifications.",
    unavailable: { title: "Notifications aren't available right now", body: "This service isn't switched on yet. Check back later." },
    guest: {
      title: "Sign in to see your notifications",
      body: "Your session has ended or you haven't signed in yet.",
      cta: "Sign in",
    },
    markFailed: "We couldn't update the read status. Please try again.",
  },
  rail: {
    title: "What reaches you",
    desc: "The types switched on for your account right now.",
    on: "On",
    off: "Off",
    items: {
      likes: "Likes and reposts",
      comments: "Comments",
      follows: "New followers",
      mentions: "Mentions",
      messages: "Messages and requests",
      exam_results: "Exam results and achievements",
      product_updates: "Platform updates",
    },
    manage: "Manage notifications",
    unavailable: "Notification settings aren't available yet, so the default settings apply.",
    error: "We couldn't load your notification settings right now.",
    tip: {
      title: "Results the moment they're graded",
      body: "Finish an exam and its result arrives here, with a link to review your answers.",
      cta: "Start an exam",
    },
  },
};

export default notifications;
