import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
// Native save/share for the PDF export. Install once:
//   npx expo install expo-file-system expo-sharing
// (Both are bundled in Expo Go, so no dev-client rebuild is needed to test.)
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// LAN address of the static server started with:
//   cd app; python -m http.server 8000 --bind 0.0.0.0
// Phone must be on the same Wi-Fi network as this machine.
const CARBOX_URL = 'http://10.0.0.19:8000/index.html';
const CARBOX_ORIGIN = (CARBOX_URL.match(/^https?:\/\/[^/]+/) || ['http://10.0.0.19:8000'])[0];
const LIGHT = '#F4F4F4';
const DARK = '#1D1C1C'; // must match --page-bg in style.css dark theme so safe areas blend in

// write the base64 PDF to a cache file, then open the native share sheet
async function savePdf(name, dataUrl) {
  try {
    const base64 = (String(dataUrl).split(',')[1]) || '';
    const uri = (FileSystem.cacheDirectory || '') + (name || 'CarBox_history.pdf');
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Save or share your CarBox history',
      });
    }
  } catch (e) { /* user cancelled or share unavailable */ }
}

export default function App() {
  // the page posts { theme } whenever the CarBox theme changes,
  // so the native safe areas always match the web content
  const [bg, setBg] = useState(LIGHT);
  const dark = bg === DARK;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} backgroundColor={bg} />
      <WebView
        source={{ uri: CARBOX_URL }}
        style={{ flex: 1, backgroundColor: bg }}
        cacheEnabled={false}
        geolocationEnabled={true}                    /* Android: bridge navigator.geolocation */
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"      /* iOS: allow camera capture from <input type=file> */
        allowFileAccess={true}                        /* Android: <input type=file> photo picker */
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptCanOpenWindowsAutomatically={true}
        originWhitelist={['*']}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        /* open external links (Google Maps, legal, mailto) in the system browser,
           and NEVER let a blob:/data: PDF navigate the whole app (that traps the user) */
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url || '';
          if (url.startsWith(CARBOX_ORIGIN) || url.startsWith('about:')) return true;
          if (url.startsWith('blob:') || url.startsWith('data:')) return false;
          if (/^https?:/i.test(url) || /^(mailto:|tel:)/i.test(url)) { Linking.openURL(url).catch(() => {}); return false; }
          return true;
        }}
        injectedJavaScript={`(function(){try{var t=document.documentElement.getAttribute('data-theme')||'light';window.ReactNativeWebView.postMessage(JSON.stringify({theme:t}))}catch(e){}})(); true;`}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.theme) setBg(d.theme === 'dark' ? DARK : LIGHT);
            if (d.type === 'savePdf' && d.dataUrl) savePdf(d.name, d.dataUrl);
          } catch (err) {}
        }}
      />
    </SafeAreaView>
  );
}
