import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

// Hosted on GitHub Pages from the `gh-pages` branch (a snapshot of app/).
// Rebuild + push that branch after changing anything under app/ (see
// CLAUDE.md for the app/ source of truth).
const CARBOX_URL = 'https://goathoat.github.io/CarBox/index.html';
const LIGHT = '#F4F4F4';
const DARK = '#1D1C1C'; // must match --page-bg in style.css dark theme so safe areas blend in
const REMINDER_ID = 'carbox-service-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Mileage-based reminders (e.g. "due in 400 mi") have no fixed calendar
// date to fire on, so instead of faking one, this schedules an honest
// recurring weekly nudge to go check the car's actual mileage in-app.
async function syncReminder(enabled, service) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!enabled) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'CarBox reminder',
      body: service && service.title
        ? `${service.title} may be coming up — check your mileage in CarBox.`
        : 'Check your service schedule in CarBox.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60 * 60 * 24 * 7,
      repeats: true,
    },
  });
}

export default function App() {
  // the page posts { theme } whenever the CarBox theme changes,
  // so the native safe areas always match the web content
  const [bg, setBg] = useState(LIGHT);
  const dark = bg === DARK;
  const webviewRef = useRef(null);

  useEffect(() => {
    return () => Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} backgroundColor={bg} />
      <WebView
        ref={webviewRef}
        source={{ uri: CARBOX_URL }}
        style={{ flex: 1, backgroundColor: bg }}
        cacheEnabled={false}
        originWhitelist={['*']}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        injectedJavaScript={`(function(){try{var t=document.documentElement.getAttribute('data-theme')||'light';window.ReactNativeWebView.postMessage(JSON.stringify({theme:t}))}catch(e){}})(); true;`}
        onMessage={(e) => {
          let d;
          try { d = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
          if (d.theme) setBg(d.theme === 'dark' ? DARK : LIGHT);
          if (d.type === 'reminders') syncReminder(d.enabled, d.service);
          if (d.type === 'share') Share.share({ message: d.message ? `${d.message}\n${d.url}` : d.url, url: d.url });
        }}
      />
    </SafeAreaView>
  );
}
