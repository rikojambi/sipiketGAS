/**
 * Notifications.gs - daftar dan penandaan notifikasi.
 * Notifikasi dibuat otomatis oleh transaksi melalui spkCreateNotification().
 */

function spkNotificationsList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var limit = parseInt(data.limit, 10) || 50;
  if (limit < 1 || limit > 200) { limit = 50; }
  var rows = SIPIKET_Store.getRows('NOTIFICATIONS').filter(function (n) {
    if (n.status === 'DELETED') { return false; }
    if (spkIsSuperadmin(user)) { return true; }
    if (n.recipientUserId && n.recipientUserId === user.id) { return true; }
    return !!n.recipientRole && n.recipientRole === user.role;
  });
  rows.sort(function (a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  var items = rows.slice(0, limit);
  var unread = rows.filter(function (n) {
    return !(n.read === true || n.read === 'TRUE' || n.read === 'true');
  }).length;
  return { items: items, unread: unread };
}

function spkNotificationsRead(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id notifikasi', 120);
  var row = SIPIKET_Store.findRow('NOTIFICATIONS', function (n) { return n.id === id; });
  spkAssert(!!row, 'NOT_FOUND', 'Notifikasi tidak ditemukan.');
  if (!spkIsSuperadmin(user)) {
    var owned = (row.recipientUserId && row.recipientUserId === user.id) ||
      (row.recipientRole && row.recipientRole === user.role);
    spkAssert(owned, 'FORBIDDEN', 'Notifikasi ini bukan untuk Anda.');
  }
  var updated = SIPIKET_Store.updateRow('NOTIFICATIONS', id, {
    read: true,
    readAt: spkNowIsoJakarta()
  });
  return { item: updated };
}
