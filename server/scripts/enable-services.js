// 把已持久化的营业设置里三项社区服务（快递代取 / 便利店代买 / 邻里闲置）切到在线。
// 用法：npm run enable-services
// 说明：DEFAULT_SETTINGS 只在数据库没有设置文档时生效；已经保存过设置的环境用本脚本补齐。
import 'dotenv/config';
import { connectDb, closeDb, col, SETTINGS_ID } from '../src/db.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { readSettings, writeSettings } from '../src/modules/settings.js';

async function main() {
  await connectDb();
  const doc = await col.settings.findOne({ _id: SETTINGS_ID });
  if (!doc) {
    console.log('数据库还没有设置文档，将直接使用 DEFAULT_SETTINGS（默认已全部在线）。');
    await closeDb();
    return;
  }

  const current = await readSettings();
  const next = {
    ...current,
    expressEnabled: true,
    purchaseEnabled: true,
    secondhandEnabled: true,
    expressStations: current.expressStations && current.expressStations.length
      ? current.expressStations
      : DEFAULT_SETTINGS.expressStations
  };
  const saved = await writeSettings(next);
  console.log('社区服务已开启：', {
    快递代取: saved.expressEnabled,
    便利店代买: saved.purchaseEnabled,
    邻里闲置: saved.secondhandEnabled,
    快递站点: saved.expressStations
  });
  await closeDb();
}

main().catch(async (error) => {
  console.error(error.message || error);
  process.exit(1);
});
