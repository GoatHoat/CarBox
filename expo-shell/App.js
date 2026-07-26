import { useState, useRef } from 'react';
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
  ios: 'appl_qfyDDoPnIdTchAizaHHpqHFiKWz',      // real Apple public SDK key
  android: 'goog_REPLACE_WITH_YOUR_GOOGLE_KEY', // TODO: Play key when you add Android
  default: 'appl_qfyDDoPnIdTchAizaHHpqHFiKWz',
});
const RC_ENTITLEMENT = 'pro';   // must match app/billing.js + your RevenueCat entitlement id

// The web paywall (app/pro.js -> app/billing.js) calls a bridge object it expects
// at window.CarBoxNativeBilling. This stub, injected before the page loads, turns
// those calls into postMessages and returns Promises that resolve when the native
// side answers (see handleBilling below). Inside this iOS shell the paywall's
// Subscribe button routes HERE (StoreKit) — App Store compliance; Stripe is only
// used on the website, never from within the app.
const NATIVE_BRIDGE = `(function(){
  window.CARBOX_NATIVE_SHELL = true;
  if (window.CarBoxNativeBilling) return;
  var pending = {}, seq = 0;
  function call(method, arg){
    return new Promise(function(resolve, reject){
      var id = 'rc' + (++seq), done = false;
      var to = setTimeout(function(){
        if (done || !pending[id]) return; done = true; delete pending[id];
        reject(new Error('The App Store took too long to respond. Make sure you are signed into a Sandbox account and your products are Ready to Submit.'));
      }, 45000);
      pending[id] = {
        resolve: function(v){ if (done) return; done = true; clearTimeout(to); resolve(v); },
        reject:  function(e){ if (done) return; done = true; clearTimeout(to); reject(e); }
      };
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ __rc: 1, id: id, method: method, arg: arg })); }
      catch (e) { if (!done){ done = true; clearTimeout(to); delete pending[id]; reject(e); } }
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

  // RevenueCat is configured LAZILY — only the first time a purchase/entitlement
  // call actually happens, never at app launch. That way a bad key or a store
  // hiccup can only make a purchase fail (with a normal error toast in the web
  // app); it can NEVER stop the app from opening. Configured at most once.
  const rcReady = useRef(false);
  function ensureRC() {
    if (rcReady.current) return true;
    try {
      if (!Purchases || !Purchases.configure) return false;
      try { if (Purchases.setLogLevel && Purchases.LOG_LEVEL) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN); } catch (e) {}
      Purchases.configure({ apiKey: RC_API_KEY });
      rcReady.current = true;
      return true;
    } catch (e) {
      return false;
    }
  }

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

  // show a toast in the web app (also proves the native->web inject path works)
  function notify(msg) {
    if (!webref.current) return;
    webref.current.injectJavaScript('window.UI&&UI.toast&&UI.toast(' + JSON.stringify(msg) + '); true;');
  }
  // race a promise against a timeout so a hung StoreKit call can't freeze the flow
  function withTimeout(p, ms, msg) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
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
    // "manage" only opens a URL — never needs RevenueCat.
    if (d.method === 'manage') {
      const url = Platform.OS === 'android'
        ? 'https://play.google.com/store/account/subscriptions'
        : 'https://apps.apple.com/account/subscriptions';
      Linking.openURL(url).catch(() => {});
      return;
    }
    // getEntitlement fires on page load. Do NOT spin up RevenueCat just to check
    // on load — if it hasn't been configured yet (no purchase attempted this
    // session), report "not active" and move on. This keeps RevenueCat entirely
    // off the launch path, so it can never stop the app from opening.
    if (d.method === 'getEntitlement' && !rcReady.current) { reply(true, false); return; }
    // purchase / restore (explicit user action) — configure now, guarded.
    if (!ensureRC()) { reply(false, 'In-app purchases are not available right now.'); return; }
    try {
      if (d.method === 'getEntitlement') {
        const info = await Purchases.getCustomerInfo();
        reply(true, !!(info.entitlements.active && info.entitlements.active[RC_ENTITLEMENT]));
      } else if (d.method === 'purchase') {
        notify('Contacting the App Store…');
        const offerings = await withTimeout(Purchases.getOfferings(), 20000,
          'Could not reach the App Store for your products. Check you are signed into a Sandbox account and the products are Ready to Submit.');
        const current = offerings && offerings.current;
        if (!current) return reply(false, 'No RevenueCat offering is set as Current. Set your offering to Current in RevenueCat.');
        const pkg = planPackage(current, d.arg);
        if (!pkg) {
          const n = (current.availablePackages || []).length;
          return reply(false, 'Your offering has no ' + (d.arg === 'monthly' ? 'Monthly' : 'Annual') +
            ' package (found ' + n + ' package(s)). Add Monthly/Annual packages pointing at your App Store products.');
        }
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
