import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getCatalog, type Product } from './src/api';
import { apiConfig, missingConfig } from './src/config';
import { normalizeError } from './src/client';
import { useSession } from './src/session';
import { theme, toneColor } from './src/theme';

type CheckState = {
  status: 'idle' | 'loading' | 'ok' | 'error';
  message: string;
};

export default function App() {
  const { session, pending, error: authError, signIn, signUp, signOut } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [check, setCheck] = useState<CheckState>({ status: 'idle', message: '尚未发起请求' });

  const missing = missingConfig();
  const ready = missing.length === 0;

  const runCheck = useCallback(async () => {
    if (!ready) {
      setCheck({ status: 'error', message: `请先配置环境变量：${missing.join('；')}` });
      return;
    }
    setCheck({ status: 'loading', message: '正在调用云函数 snackShop / getCatalog ...' });
    try {
      const list = await getCatalog();
      setProducts(list);
      setCheck({
        status: 'ok',
        message: `链路打通：snackShop.getCatalog 返回 ${list.length} 个商品`,
      });
    } catch (e) {
      setProducts([]);
      setCheck({ status: 'error', message: normalizeError(e) });
    }
  }, [ready, missing.join('；')]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>邻里点单 · 移动端自检</Text>
      <Text style={styles.subtitle}>Expo + React Native → 自建后端 → MongoDB</Text>

      <Card title="环境">
        <Row label="API" value={apiConfig.baseUrl || '（未配置）'} />
        {!ready && <Text style={styles.hint}>{`复制 .env.example 为 .env 并填写后重启 expo start`}</Text>}
      </Card>

      <Card title="登录">
        <Row label="当前身份" value={session.uid ? session.uid : '未登录（游客）'} />
        <Row label="来源" value={session.source} />
        <TextInput
          style={styles.input}
          placeholder="用户名"
          placeholderTextColor={theme.muted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="密码"
          placeholderTextColor={theme.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <View style={styles.buttonRow}>
          <Button
            label="登录"
            onPress={() => signIn(username, password)}
            disabled={pending || !ready || !username || !password}
          />
          <Button
            label="注册"
            onPress={() => signUp(username, password)}
            disabled={pending || !ready || !username || !password}
            tone="ghost"
          />
        </View>
        {session.uid ? (
          <Button label="退出" onPress={signOut} disabled={pending} tone="ghost" />
        ) : null}
        {authError ? <Text style={styles.error}>{authError}</Text> : null}
      </Card>

      <Card title="链路自检">
        <View style={styles.checkRow}>
          {check.status === 'loading' ? <ActivityIndicator /> : null}
          <Text
            style={[
              styles.checkText,
              check.status === 'ok' && styles.ok,
              check.status === 'error' && styles.error,
            ]}
          >
            {check.message}
          </Text>
        </View>
        <Button label="重新自检" onPress={runCheck} tone="ghost" />
      </Card>

      <Text style={styles.sectionTitle}>菜单（{products.length}）</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.product}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: toneColor(item.tone) }]} />
            )}
            <View style={styles.productMain}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productSpec}>{item.spec || item.category}</Text>
            </View>
            <Text style={styles.price}>{`¥${item.price}`}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.hint}>暂无商品数据。若自检失败，请先按提示修复。</Text>
        }
      />
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  tone = 'solid',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'solid' | 'ghost';
}) {
  const solid = tone === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        solid ? styles.buttonSolid : styles.buttonGhost,
        (disabled || pressed) && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonText, solid ? styles.buttonTextSolid : styles.buttonTextGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  list: { padding: theme.space, paddingBottom: 40 },
  header: { gap: theme.space },
  title: { fontSize: 22, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 13, color: theme.muted, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 6 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: theme.space,
    borderWidth: 1,
    borderColor: theme.line,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: theme.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, color: theme.muted },
  rowValue: { flex: 1, fontSize: 13, color: theme.text, textAlign: 'right' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { flex: 1, fontSize: 13, color: theme.text },
  ok: { color: theme.ok },
  error: { color: theme.danger, fontSize: 13 },
  hint: { fontSize: 12, color: theme.warn },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
    backgroundColor: '#FFF',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  buttonSolid: { backgroundColor: theme.brand, flex: 1 },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.line },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 14, fontWeight: '600' },
  buttonTextSolid: { color: '#FFF' },
  buttonTextGhost: { color: theme.text },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.line,
    gap: 12,
  },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  productMain: { flex: 1, gap: 2 },
  productName: { fontSize: 15, fontWeight: '600', color: theme.text },
  productSpec: { fontSize: 12, color: theme.muted },
  price: { fontSize: 15, fontWeight: '700', color: theme.brand },
});
