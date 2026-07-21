import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';

// LAN address of the static server started with:
//   cd app; python -m http.server 8000 --bind 0.0.0.0
// Phone must be on the same Wi-Fi network as this machine.
const CARBOX_URL = 'http://10.0.0.19:8000/index.html';
const LIGHT = '#F4F4F4';
const DARK = '#191919';

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
        originWhitelist={['*']}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        injectedJavaScript={`(function(){try{var t=document.documentElement.getAttribute('data-theme')||'light';window.ReactNativeWebView.postMessage(JSON.stringify({theme:t}))}catch(e){}})(); true;`}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.theme) setBg(d.theme === 'dark' ? DARK : LIGHT);
          } catch (err) {}
        }}
      />
    </SafeAreaView>
  );
}
