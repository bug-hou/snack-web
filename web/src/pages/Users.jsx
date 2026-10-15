import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '../cloud';
import { useToast, Empty, LoadingRow, Modal, Pager, SearchBox, Chip, Icon } from '../ui';
import { yuan, formatTime, ORDER_STATUS, STATUS_TONE, CONTACT } from '../utils';

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState({ list: [], page: 1, total: 0, hasMore: false });
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const keywordRef = React.useRef('');
  keywordRef.current = keyword;

  const load = useCallback(async (page = 1, kw = keywordRef.current) => {
    setLoading(true);
    try { setUsers(await invoke('getUsers', { page, keyword: kw })); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(1, ''); }, [load]);

  async function open(user) {
    setDetail({ user, orders: [], addresses: [], loading: true });
    try {
      const data = await invoke('getUserDetail', { openid: user.openid });
      setDetail({ user, ...data, loading: false });
    } catch (e) {
      toast(e.message, 'error');
      setDetail(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Customers</span>
          <h1>用户管理</h1>
          <p>下过单或保存过地址的邻居都会出现在这里，共 {users.total} 位。</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={() => load(users.page)} disabled={loading}><Icon name="shares" size={15} />刷新</button>
        </div>
      </div>

      <form className="toolbar" onSubmit={e => { e.preventDefault(); load(1, keyword); }}>
        <SearchBox value={keyword} onChange={setKeyword} placeholder="搜索姓名、手机号、楼栋门牌" />
        <button className="btn btn-primary btn-sm" type="submit">搜索</button>
        {keyword && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setKeyword(''); load(1, ''); }}>清除</button>}
      </form>

      {loading ? <LoadingRow text="正在加载用户…" /> : users.list.length === 0
        ? <Empty title={keyword ? '没有匹配的用户' : '还没有用户'} text="顾客下单或保存地址后会出现在这里。" />
        : (
          <div className="table-wrap">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>顾客</th><th>常用地址</th><th>订单数</th><th>累计消费</th><th>最近活跃</th><th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.list.map(u => (
                    <tr key={u.openid}>
                      <td>
                        <div className="cell-main">
                          <strong>{u.recipient || '未填写姓名'}</strong>
                          <small>{u.phone || '未留手机号'}</small>
                        </div>
                      </td>
                      <td>{u.building ? `${u.building} 栋 ${u.room || ''}` : '—'}</td>
                      <td className="num">{u.orderCount || 0}</td>
                      <td className="money">{yuan(u.spentCents)}</td>
                      <td className="small muted">{formatTime(u.lastActiveAt)}</td>
                      <td className="cell-actions"><button className="btn-link" onClick={() => open(u)}>查看</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <Pager page={users.page} hasMore={users.hasMore} busy={loading}
        onPrev={() => load(Math.max(1, users.page - 1))} onNext={() => load(users.page + 1)} />

      {detail && (
        <Modal
          wide
          title={detail.user.recipient || '未填写姓名'}
          subtitle={`${detail.user.phone || '未留手机号'} · ${detail.user.building ? `${detail.user.building} 栋 ${detail.user.room || ''}` : '暂无地址'}`}
          onClose={() => setDetail(null)}
          footer={<button className="btn btn-ghost" onClick={() => setDetail(null)}>关闭</button>}
        >
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat"><span>累计订单</span><strong>{detail.user.orderCount || 0}</strong><small>含已取消</small></div>
            <div className="stat"><span>累计消费</span><strong>{yuan(detail.user.spentCents)}</strong><small>不含已取消</small></div>
            <div className="stat"><span>收货地址</span><strong>{detail.user.addressCount || 0}</strong><small>最多 10 个</small></div>
          </div>

          <div className="small muted">用户标识：<span className="user-id">{detail.user.openid}</span></div>

          {detail.loading ? <LoadingRow text="正在加载详情…" /> : (
            <>
              <div>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>收货地址</h3>
                {detail.addresses.length ? (
                  <div className="stack">
                    {detail.addresses.map(a => (
                      <div className="card card-pad" key={a.id} style={{ padding: '12px 14px' }}>
                        <div className="row-between">
                          <strong>{a.label || '家'} · 保利爱尚里 {a.building} 栋 {a.room}</strong>
                          <Chip tone="grey">{CONTACT[a.contactPreference] || '请敲门'}</Chip>
                        </div>
                        <div className="small muted">{a.recipient}　{a.phone}{a.pickupPhoneLast4 ? ` · 取件尾号 ${a.pickupPhoneLast4}` : ''}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="还没有保存地址" />}
              </div>

              <div>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>最近订单（最多 50 条）</h3>
                {detail.orders.length ? (
                  <div className="stack">
                    {detail.orders.map(o => (
                      <div className="card card-pad" key={o._id} style={{ padding: '12px 14px' }}>
                        <div className="row-between">
                          <strong>#{o._id.slice(-8).toUpperCase()}</strong>
                          <div className="row">
                            <Chip tone={STATUS_TONE[o.status] || 'grey'}>{ORDER_STATUS[o.status] || o.status}</Chip>
                            <span className="money">{yuan(o.totalCents)}</span>
                          </div>
                        </div>
                        <div className="small muted">{(o.items || []).map(i => `${i.name}×${i.quantity}`).join('、') || (o.orderType === 'express' ? '快递代取' : o.orderType === 'purchase' ? '便利店代买' : '—')}</div>
                        <div className="small muted">{formatTime(o.createdAt)}{o.customerDeleted ? ' · 用户已删除' : ''}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="还没有订单" />}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
