/**
 * Optional Firebase Cloud Messaging (legacy HTTP API).
 * Set FCM_SERVER_KEY in .env to enable push delivery.
 */

async function sendFcmNotification(token, { title, body, data = {} }) {
  const serverKey = String(process.env.FCM_SERVER_KEY || "").trim();
  const deviceToken = String(token || "").trim();

  if (!serverKey || !deviceToken) {
    return { sent: false, reason: "not_configured" };
  }

  const payload = {
    to: deviceToken,
    notification: {
      title: String(title || "Notification").slice(0, 120),
      body: String(body || "").slice(0, 500),
    },
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value ?? "")])
    ),
  };

  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { sent: false, reason: "fcm_error", result };
    }

    return { sent: true, result };
  } catch (error) {
    return { sent: false, reason: error.message || "fcm_request_failed" };
  }
}

module.exports = {
  sendFcmNotification,
};
