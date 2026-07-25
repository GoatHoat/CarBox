import { useState, useRef, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import Purchases from 'react-native-purchases';
// Native save/share for the PDF export. Installed via:
//   npx expo install expo-file-system expo-sharing
// NOTE: SDK 54's expo-file-system v19 moved the classic writeAsStringAsync/
// cacheDirectory API to the /legacy entry point — use it so those exist.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// Production: the app is hosted on Vercel (HTTPS), so it loads for any user on
// any network. (For local dev against a LAN static server, temporarily swap this
// to e.g. 'http://10.0.0.19:8000/index.html'.)
const CARBOX_URL = 'https://carbox-one.vercel.app/index.html';
const CARBOX_ORIGIN = (CARBOX_URL.match(/^https?:\/\/[^/]+/) || ['https://carbox-one.vercel.app'])[0];
const LIGHT = '#F4F4F4';
const DARK = '#1D1C1C'; // must match --page-bg in style.css dark theme so safe areas blend in

// ─── RevenueCat (Apple StoreKit / Google Play in-app purchase) ───────────────
// Public SDK key — safe to ship (public, not a secret like sk_...).
// The test_ key below is RevenueCat's TEST STORE: it lets you test the purchase
// FLOW in a dev build without App Store Connect (simulated, no real charge).
// For REAL Apple sandbox + production, replace ios with your Apple key (appl_...);
// for Google Play, android with your Google key (goog_...).
const RC_API_KEY = Platform.select({
  ios: 'test_QaxgToHQrnLJBPsiFFzwtiJlFMb',      // TODO: swap for appl_... before real Apple purchases
  android: 'test_QaxgToHQrnLJBPsiFFzwtiJlFMb',  // TODO: swap for goog_... before Play
  default: 'test_QaxgToHQrnLJBPsiFFzwtiJlFMb',
});
const RC_ENTITLEMENT = 'pro';   // must match app/billing.js + your RevenueCat entitlement id

// The web paywall (app/pro.js -> app/billing.js) calls a bridge object it expects
// at window.CarBoxNativeBilling. This stub, injected before the page loads, turns
// those calls into postMessages and returns Promises that resolve when the native
// side answers (see handleBilling below). Only the SECONDARY "or pay on app"
// button routes here; the main Subscribe button is Stripe (web).
const NATIVE_BRIDGE = `(function(){
  window.CARBOX_NATIVE_SHELL = true;
  if (window.CarBoxNativeBilling) return;
  var pending = {}, seq = 0;
  function call(method, arg){
    return new Promise(function(resolve, reject){
      var id = 'rc' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ __rc: 1, id: id, method: method, arg: arg })); }
      catch (e) { delete pending[id]; reject(e); }
    });
  }
  window.__cbBillingResult = function(id, ok, value){
    var p = pending[id]; if (!p) return; delete pending[id];
    if (ok) p.resolve(value); else p.reject(new Error(value || 'purchase failed'));
  };
  window.CarBoxNativeBilling = {
    getEntitlement: function(){ return call('getEntitlement'); },
    purchase: function(plan){ return call('purchase', plan); },
    restore: function(){ return call('restore'); },
    manage: function(){ try { window.ReactNativeWebView.postMessage(JSON.stringify({ __rc: 1, method: 'manage' })); } catch(e){} }
  };
})(); true;`;

// write the base64 PDF to a cache file, then open the native share sheet
async function savePdf(name, dataUrl) {
  try {
    const base64 = (String(dataUrl).split(',')[1]) || '';
    const uri = (FileSystem.cacheDirectory || '') + (name || 'Coilover_history.pdf');
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Save or share your Coilover history',
      });
    }
  } catch (e) { /* user cancelled or share unavailable */ }
}

export default function App() {
  // the page posts { theme } whenever the Coilover theme changes,
  // so the native safe areas always match the web content
  const [bg, setBg] = useState(LIGHT);
  const dark = bg === DARK;
  const webref = useRef(null);

  // configure RevenueCat once on launch
  useEffect(() => {
    try {
      if (Purchases.setLogLevel && Purchases.LOG_LEVEL) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
      Purchases.configure({ apiKey: RC_API_KEY });
    } catch (e) { /* dev/Expo Go without the native module — bridge just no-ops */ }
  }, []);

  // pick the package for a plan: prefer the offering's convenience accessors,
  // else match by package type on the current offering.
  function planPackage(current, plan) {
    if (!current) return null;
    if (plan === 'monthly') return current.monthly || byType(current, 'MONTHLY');
    return current.annual || byType(current, 'ANNUAL');
  }
  function byType(offering, type) {
    const list = offering.availablePackages || [];
    for (let i = 0; i < list.length; i++) if (list[i].packageType === type) return list[i];
    return null;
  }

  // native side of the billing bridge: answer getEntitlement/purchase/restore/manage
  async function handleBilling(d) {
    const reply = (ok, value) => {
      if (!webref.current) return;
      webref.current.injectJavaScript(
        'window.__cbBillingResult(' + JSON.stringify(d.id) + ',' + (ok ? 'true' : 'false') + ',' +
        JSON.stringify(value === undefined ? null : value) + '); true;'
      );
    };
    try {
      if (d.method === 'getEntitlement') {
        const info = await Purchases.getCustomerInfo();
        reply(true, !!(info.entitlements.active && info.entitlements.active[RC_ENTITLEMENT]));
      } else if (d.method === 'purchase') {
        const offerings = await Purchases.getOfferings();
        const pkg = planPackage(offerings.current, d.arg);
        if (!pkg) return reply(false, 'That plan is not available yet.');
        try {
          const { customerInfo } = await Purchases.purchasePackage(pkg);
          reply(true, !!(customerInfo.entitlements.active && customerInfo.entitlements.active[RC_ENTITLEMENT]));
        } catch (err) {
          // user tapping "cancel" is not a failure — just "not subscribed"
          if (err && err.userCancelled) return reply(true, false);
          reply(false, (err && err.message) || 'Purchase could not be completed.');
        }
      } else if (d.method === 'restore') {
        const info = await Purchases.restorePurchases();
        reply(true, !!(info.entitlements.active && info.entitlements.active[RC_ENTITLEMENT]));
      } else if (d.method === 'manage') {
        const url = Platform.OS === 'android'
          ? 'https://play.google.com/store/account/subscriptions'
          : 'https://apps.apple.com/account/subscriptions';
        Linking.openURL(url).catch(() => {});
      }
    } catch (err) {
      reply(false, (err && err.message) || 'Billing error.');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} backgroundColor={bg} />
      <WebView
        ref={webref}
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
        injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE}
        injectedJavaScript={`(function(){try{var t=document.documentElement.getAttribute('data-theme')||'light';window.ReactNativeWebView.postMessage(JSON.stringify({theme:t}))}catch(e){}})(); true;`}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d && d.__rc) { handleBilling(d); return; }
            if (d.theme) setBg(d.theme === 'dark' ? DARK : LIGHT);
            if (d.type === 'savePdf' && d.dataUrl) savePdf(d.name, d.dataUrl);
          } catch (err) {}
        }}
      />
    </SafeAreaView>
  );
}
