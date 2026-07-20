import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// LAN address of the static server started with:
//   cd app; python -m http.server 8000 --bind 0.0.0.0
// Phone must be on the same Wi-Fi network as this machine.
const CARBOX_URL = 'http://10.0.0.19:8000/index.html';

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" backgroundColor="#F4F4F4" />
      <WebView
        source={{ uri: CARBOX_URL }}
        style={styles.web}
        originWhitelist={['*']}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F4' },
  web: { flex: 1, backgroundColor: '#F4F4F4' },
});
