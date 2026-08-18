import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { CartProvider } from '../lib/cart';
import { SocketProvider } from '../lib/socket';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
        <SocketProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontWeight: '800', color: colors.text },
              headerTintColor: colors.brand,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="register" options={{ title: 'Create account' }} />
            <Stack.Screen name="verify-phone" options={{ title: 'Verify number' }} />
            <Stack.Screen name="customer/index" options={{ title: 'RideRescue' }} />
            <Stack.Screen name="customer/booking/[id]" options={{ title: 'Track mechanic' }} />
            <Stack.Screen name="customer/bookings" options={{ title: 'My bookings' }} />
            <Stack.Screen name="customer/profile" options={{ title: 'My bikes & profile' }} />
            <Stack.Screen name="customer/store" options={{ title: 'Spare parts' }} />
            <Stack.Screen name="customer/cart" options={{ title: 'Cart' }} />
            <Stack.Screen name="customer/orders" options={{ title: 'My orders' }} />
            <Stack.Screen name="mechanic/index" options={{ title: 'Mechanic dashboard' }} />
            <Stack.Screen name="mechanic/job/[id]" options={{ title: 'Job details' }} />
            <Stack.Screen name="mechanic/earnings" options={{ title: 'Earnings' }} />
            <Stack.Screen name="mechanic/profile" options={{ title: 'My profile' }} />
            <Stack.Screen name="mechanic/history" options={{ title: 'Job history' }} />
          </Stack>
        </SocketProvider>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
