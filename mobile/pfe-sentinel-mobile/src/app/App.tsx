import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MissionScreen } from './screens/MissionScreen';
import { OutboxScreen } from './screens/OutboxScreen';
import { OutboxDetailScreen } from './screens/OutboxDetailScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import { ProductScreen } from './screens/ProductScreen';
import { StockInScreen } from './screens/StockInScreen';
import { StockOutScreen } from './screens/StockOutScreen';
import { ScanScreen } from './screens/ScanScreen';
import { InventoryScreen } from './screens/InventoryScreen';
import { LocationsScreen } from './screens/LocationsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HseSheetScreen } from './screens/HseSheetScreen';
import { SignatureScreen } from './screens/SignatureScreen';

import { SessionStore, type Session } from '../core/session/sessionStore';
import type { HseAcknowledgement, StockOutDraft } from '../core/stock/stockOutDraft';

type Nav =
  | { screen: 'splash' }
  | { screen: 'login' }
  | { screen: 'dashboard' }
  | { screen: 'settings' }
  | { screen: 'mission' }
  | { screen: 'scan' }
  | { screen: 'inventory' }
  | { screen: 'locations' }
  | { screen: 'history' }
  | { screen: 'catalog' }
  | { screen: 'product'; params: { id: string } }
  | { screen: 'stock_in'; params: { productId: string } }
  | { screen: 'stock_out'; params: { productId: string } }
  | { screen: 'hse_sheet' }
  | { screen: 'signature' }
  | { screen: 'outbox' }
  | { screen: 'outbox_detail'; params: { id: string } };

export function App() {
  const [nav, setNav] = useState<Nav>({ screen: 'splash' });
  const [session, setSession] = useState<Session | null>(null);
  const [stockOutDraft, setStockOutDraft] = useState<StockOutDraft | null>(null);
  const [hseAck, setHseAck] = useState<HseAcknowledgement | null>(null);

  const go = useCallback((next: Nav) => setNav(next), []);
  const backToDashboard = useCallback(() => setNav({ screen: 'dashboard' }), []);

  const onSplashDone = useCallback(async (hasSession: boolean) => {
    if (!hasSession) {
      setNav({ screen: 'login' });
      return;
    }
    const s = await SessionStore.get().catch(() => null);
    setSession(s);
    setNav({ screen: s?.token ? 'dashboard' : 'login' });
  }, []);

  const onLogin = useCallback((s: Session) => {
    setSession(s);
    setNav({ screen: 'dashboard' });
  }, []);

  const onLogout = useCallback(() => {
    setSession(null);
    setStockOutDraft(null);
    setHseAck(null);
    setNav({ screen: 'login' });
  }, []);

  const content = useMemo(() => {
    if (nav.screen === 'splash') return <SplashScreen onDone={onSplashDone} />;
    if (nav.screen === 'login') {
      return <LoginScreen onLogin={onLogin} onOpenSettings={() => go({ screen: 'settings' })} />;
    }
    if (nav.screen === 'settings') return <SettingsScreen onBack={() => (session?.token ? backToDashboard() : go({ screen: 'login' }))} />;
    if (nav.screen === 'dashboard') {
      return (
        <DashboardScreen
          onOpenMission={() => go({ screen: 'mission' })}
          onOpenOutbox={() => go({ screen: 'outbox' })}
          onOpenCatalog={() => go({ screen: 'catalog' })}
          onOpenScan={() => go({ screen: 'scan' })}
          onOpenInventory={() => go({ screen: 'inventory' })}
          onOpenLocations={() => go({ screen: 'locations' })}
          onOpenHistory={() => go({ screen: 'history' })}
          onOpenSettings={() => go({ screen: 'settings' })}
          onLogout={onLogout}
        />
      );
    }
    if (nav.screen === 'mission') return <MissionScreen onBack={backToDashboard} />;
    if (nav.screen === 'scan') return <ScanScreen onBack={backToDashboard} onOpenProduct={(id) => go({ screen: 'product', params: { id } })} />;
    if (nav.screen === 'inventory') return <InventoryScreen onBack={backToDashboard} />;
    if (nav.screen === 'locations') return <LocationsScreen onBack={backToDashboard} />;
    if (nav.screen === 'history') return <HistoryScreen onBack={backToDashboard} onOpenDetail={(id) => go({ screen: 'outbox_detail', params: { id } })} />;
    if (nav.screen === 'outbox') return <OutboxScreen onBack={backToDashboard} onOpenDetail={(id) => go({ screen: 'outbox_detail', params: { id } })} />;
    if (nav.screen === 'outbox_detail') return <OutboxDetailScreen id={nav.params.id} onBack={() => go({ screen: 'outbox' })} />;
    if (nav.screen === 'catalog') return <CatalogScreen onBack={backToDashboard} onOpenProduct={(id) => go({ screen: 'product', params: { id } })} />;
    if (nav.screen === 'product') {
      return (
        <ProductScreen
          productId={nav.params.id}
          onBack={() => go({ screen: 'catalog' })}
          onStockIn={(productId) => go({ screen: 'stock_in', params: { productId } })}
          onStockOut={(productId) => go({ screen: 'stock_out', params: { productId } })}
        />
      );
    }
    if (nav.screen === 'stock_in') return <StockInScreen productId={nav.params.productId} onBack={() => go({ screen: 'product', params: { id: nav.params.productId } })} />;
    if (nav.screen === 'stock_out') {
      return (
        <StockOutScreen
          productId={nav.params.productId}
          onBack={() => go({ screen: 'product', params: { id: nav.params.productId } })}
          onReady={(draft) => {
            setStockOutDraft(draft);
            setHseAck(null);
            go({ screen: 'hse_sheet' });
          }}
        />
      );
    }
    if (nav.screen === 'hse_sheet') {
      if (!stockOutDraft) return <DashboardScreenFallback onBack={backToDashboard} />;
      return (
        <HseSheetScreen
          draft={stockOutDraft}
          onBack={() => go({ screen: 'stock_out', params: { productId: stockOutDraft.productId } })}
          onConfirmed={(ack) => {
            setHseAck(ack);
            go({ screen: 'signature' });
          }}
        />
      );
    }
    if (nav.screen === 'signature') {
      if (!stockOutDraft || !hseAck) return <DashboardScreenFallback onBack={backToDashboard} />;
      return (
        <SignatureScreen
          draft={stockOutDraft}
          hseAck={hseAck}
          onBack={() => go({ screen: 'hse_sheet' })}
          onDone={() => {
            setStockOutDraft(null);
            setHseAck(null);
            go({ screen: 'outbox' });
          }}
        />
      );
    }
    return <SplashScreen onDone={onSplashDone} />;
  }, [nav, session?.token, stockOutDraft, hseAck, backToDashboard, go, onLogin, onLogout, onSplashDone]);

  return (
    <>
      <StatusBar style="light" />
      {content}
    </>
  );
}

function DashboardScreenFallback(props: { onBack: () => void }) {
  return <MissionScreen onBack={props.onBack} />;
}
