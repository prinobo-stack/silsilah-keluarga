import { LocalNotifications } from "@capacitor/local-notifications";
import { native } from "./storage";
import { upcoming, type State } from "./domain";
export async function scheduleBirthdays(state: State, request = false) {
  if (!native) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length)
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  if (!state.settings.reminders) return;
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted" && request)
    permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted")
    throw Error(
      "Izin notifikasi belum diberikan. Ulang tahun tetap terlihat di Beranda.",
    );
  const notifications = upcoming(state)
    .filter((e) => e.date.getTime() > Date.now())
    .slice(0, 60)
    .map((e, i) => ({
      id: 10000 + i,
      title: "Ulang tahun keluarga",
      body: `Hari ini ulang tahun ${e.person.name}.`,
      schedule: { at: e.date, allowWhileIdle: false },
      extra: { personId: e.person.id },
    }));
  if (notifications.length)
    await LocalNotifications.schedule({ notifications });
}
