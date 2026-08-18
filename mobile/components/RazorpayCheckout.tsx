import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

/**
 * Razorpay Checkout on the phone, rendered inside a WebView.
 *
 * Razorpay's React Native SDK is a native module, which would mean a new
 * dependency and a full rebuild of the APK. Checkout is a web widget anyway, and
 * react-native-webview is already a dependency here (it renders the Leaflet map),
 * so the same sheet the web app opens is loaded in a WebView instead. The result
 * comes back over postMessage.
 *
 * Card details are typed into Razorpay's own page inside that WebView and never
 * reach our JavaScript — the same property the web integration relies on.
 */

export interface CheckoutOptions {
  key: string;
  amountPaise: number;
  currency: string;
  orderId: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
}

export interface CheckoutResult {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Razorpay refuses to run from an opaque origin, and a WebView fed raw HTML has
 * one (`about:blank`). Giving the document a real baseUrl is what makes checkout
 * initialise at all on Android.
 */
const ORIGIN = 'https://riderescue.in';

function buildHtml(o: CheckoutOptions) {
  // JSON.stringify keeps user-supplied values (names, emails) from breaking out
  // of the script — this string is assembled, not parsed, so quoting matters.
  const options = JSON.stringify({
    key: o.key,
    amount: o.amountPaise,
    currency: o.currency,
    order_id: o.orderId,
    name: o.name,
    description: o.description,
    prefill: o.prefill,
    theme: { color: '#2563eb' },
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html,body { margin:0; padding:0; height:100%; background:#0f172a; }
</style>
</head>
<body>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var post = function (payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  };

  function start() {
    if (!window.Razorpay) {
      post({ type: 'error', message: 'Could not load the payment gateway. Check your connection.' });
      return;
    }
    var options = ${options};

    options.handler = function (res) {
      post({
        type: 'success',
        razorpayPaymentId: res.razorpay_payment_id,
        razorpaySignature: res.razorpay_signature
      });
    };
    options.modal = {
      ondismiss: function () { post({ type: 'dismissed' }); }
    };

    try {
      var rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (res) {
        post({
          type: 'failed',
          message: (res && res.error && res.error.description) || 'The payment was declined.'
        });
      });
      rzp.open();
    } catch (e) {
      post({ type: 'error', message: String((e && e.message) || e) });
    }
  }

  // checkout.js may still be in flight when this runs.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
</script>
</body>
</html>`;
}

export function RazorpayCheckout({
  options,
  onResult,
  onDismiss,
  onError,
}: {
  options: CheckoutOptions | null;
  onResult: (result: CheckoutResult) => void;
  onDismiss: () => void;
  onError: (message: string) => void;
}) {
  const html = useMemo(() => (options ? buildHtml(options) : ''), [options]);
  if (!options) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Text style={styles.barText}>Secure payment · Razorpay</Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <WebView
          source={{ html, baseUrl: ORIGIN }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          // Checkout hands off to bank and UPI pages that set their own cookies.
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={styles.loadingText}>Opening secure checkout…</Text>
            </View>
          )}
          onMessage={(event) => {
            let msg: any;
            try {
              msg = JSON.parse(event.nativeEvent.data);
            } catch {
              return;
            }
            if (msg.type === 'success') {
              onResult({
                razorpayPaymentId: msg.razorpayPaymentId,
                razorpaySignature: msg.razorpaySignature,
              });
            } else if (msg.type === 'dismissed') {
              onDismiss();
            } else {
              onError(msg.message || 'Payment could not be completed.');
            }
          }}
          onError={() => onError('Could not load the payment gateway.')}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
    backgroundColor: '#0f172a',
  },
  barText: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  cancel: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94a3b8', fontSize: 13 },
});
