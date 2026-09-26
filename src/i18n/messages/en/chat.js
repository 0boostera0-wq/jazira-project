// Owned by the chat feature. Keep keys identical in ar/chat.js and en/chat.js.
const chat = {
  page: {
    title: "Messages",
    lead: "Your private conversations with Jazira members.",
  },

  tabs: {
    label: "Message sections",
    chats: "Chats",
    requests: "Requests",
  },

  list: {
    label: "Conversations",
    you: "You: ",
    deleted: "This message was deleted",
    attachment: "Attachment",
    noMessages: "No messages yet",
    requestSent: "Awaiting acceptance",
    declined: "Request not accepted",
    unread: "New messages",
    loadMore: "Show older chats",
    error: "We couldn't load your conversations.",
    retry: "Try again",
    empty: {
      title: "No conversations yet",
      body: "Start a conversation from any member's profile with the Message button, and it will appear here.",
      cta: "Browse the community",
    },
  },

  requests: {
    wantsToMessage: "wants to message you",
    accept: "Accept",
    ignore: "Ignore",
    acceptError: "We couldn't accept the request. Please try again.",
    ignoreError: "We couldn't ignore the request. Please try again.",
    empty: {
      title: "No requests",
      body: "When someone you don't follow messages you, their message arrives here first so you can accept or ignore it.",
    },
  },

  thread: {
    back: "Back to conversations",
    menu: "Conversation options",
    viewProfile: "View profile",
    block: "Block member",
    unblock: "Unblock",
    loadEarlier: "Show earlier messages",
    loadError: "We couldn't load the messages.",
    retry: "Try again",
    today: "Today",
    yesterday: "Yesterday",
    deleted: "This message was deleted",
    attachment: "An attachment that can't be shown here",
    empty: {
      title: "No messages yet",
      body: "Write the first message to start the conversation.",
    },
    status: {
      sending: "Sending",
      sent: "Sent",
      delivered: "Delivered",
      read: "Read",
      failed: "Not sent",
    },
    retrySend: "Resend",
    discard: "Discard",
    actions: {
      label: "Message options",
      copy: "Copy",
      copied: "Copied",
      deleteForAll: "Delete for everyone",
    },
    deleteTitle: "Delete this message for everyone?",
    deleteBody: "The message will disappear for both of you and this can't be undone. You can do this within 30 minutes of sending.",
    deleteConfirm: "Delete for everyone",
    deleteExpired: "The 30-minute window for deleting this message has passed.",
    deleteError: "We couldn't delete the message. Please try again.",
    blockTitle: "Block {name}?",
    blockBody: "Neither of you will be able to message or follow the other, or interact with each other's posts, until you unblock.",
    blockConfirm: "Block",
    unblockTitle: "Unblock {name}?",
    unblockBody: "They'll be able to message and interact with you again, depending on your privacy settings.",
    unblockConfirm: "Unblock",
    blockError: "We couldn't update the block. Please try again.",
    states: {
      incomingRequest: {
        title: "{name} wants to message you",
        body: "They won't see that you've read their messages, and you can't reply until you accept.",
      },
      requestSent: "Your request was sent to {name}. Your messages appear in their requests, and you can chat freely once they accept.",
      declined: "{name} didn't accept your message request, so you can't send new messages.",
      blockedByMe: "You've blocked this member. Unblock them to send a message.",
      cannotSend: "You can't message this member right now.",
    },
  },

  composer: {
    label: "Message to {name}",
    placeholder: "Write a message…",
    send: "Send",
    counter: "{count} / {max}",
    tooLong: "Your message is longer than the limit ({max} characters).",
  },

  noSelection: {
    title: "Choose a conversation",
    body: "Pick a conversation from the list to read and reply.",
    about: {
      title: "Messaging on Jazira",
      body: "One-to-one conversations with other members. Here's how they work.",
    },
    points: {
      private: {
        title: "Private to the two of you",
        body: "Only the two people in a conversation can see it.",
      },
      requests: {
        title: "Requests from people you don't follow",
        body: "Their messages arrive as a request you can accept or ignore.",
      },
      delete: {
        title: "Delete for everyone",
        body: "You can remove your message for both sides within 30 minutes.",
      },
    },
  },

  start: {
    opening: "Opening the conversation…",
    errors: {
      blocked: "You can't start a conversation with this member.",
      messages_disabled: "This member has turned off messages.",
      requests_disabled: "This member doesn't accept message requests from people they don't follow.",
      request_rejected: "This member didn't accept your earlier message request.",
      invalid_recipient: "We couldn't find this member.",
      not_authenticated: "Sign in to start a conversation.",
      unavailable: "Messages aren't available right now.",
      error: "We couldn't start the conversation. Please try again.",
    },
  },

  errors: {
    unavailable: "Messages aren't available right now. Please try again later.",
  },

  guest: {
    title: "Sign in to see your messages",
    body: "Your private messages belong to your account. Sign in to continue.",
    cta: "Sign in",
  },

  unknownUser: "Jazira member",
};

export default chat;
