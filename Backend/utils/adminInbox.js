const Admin = require("../models/entity/admin");
const AppNotification = require("../models/other/appNotification");

function queueAdminInbox(task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error("[admin-inbox]", error?.message || error);
      });
  });
}

async function notifyAllAdmins({
  type,
  title,
  message,
  order = null,
  orderNumber = "",
  orderStatus = "",
  metadata = {},
} = {}) {
  const admins = await Admin.find({ status: { $ne: "inactive" } })
    .select("_id")
    .lean();
  if (!admins.length) return;

  const docs = admins.map((admin) => ({
    recipientType: "admin",
    recipient: admin._id,
    type,
    title,
    message,
    order: order?._id ?? order ?? null,
    orderNumber: order?.orderNumber ?? orderNumber ?? "",
    orderStatus: orderStatus || order?.orderStatus || "",
    metadata,
  }));

  await AppNotification.insertMany(docs);
}

function queueNotifyAllAdmins(payload) {
  queueAdminInbox(() => notifyAllAdmins(payload));
}

module.exports = {
  notifyAllAdmins,
  queueNotifyAllAdmins,
};
