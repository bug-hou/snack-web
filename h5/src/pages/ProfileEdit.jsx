import { useEffect, useState } from 'react';
import { NavBar } from '../components/Layout';
import { back } from '../lib/router';
import { uploadImage } from '../lib/cloud';
import { peekProfile, loadProfile, saveProfile } from '../lib/shop';
import { useCloudImages } from '../lib/useCloudImages';
import { toast } from '../lib/ui';

const initialOf = nickName => (nickName ? nickName.slice(0, 1) : '里');

export default function ProfileEdit() {
  const [nickName, setNickName] = useState(() => peekProfile().nickName);
  const [avatarUrl, setAvatarUrl] = useState(() => peekProfile().avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const resolve = useCloudImages([avatarUrl]);

  useEffect(() => {
    let alive = true;
    loadProfile().then(profile => {
      if (!alive) return;
      setNickName(profile.nickName);
      setAvatarUrl(profile.avatarUrl);
    }).catch(() => { /* 拉取失败时保留缓存 */ });
    return () => { alive = false; };
  }, []);

  async function chooseAvatar(event) {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    try {
      const fileID = await uploadImage(file, 'avatar');
      setAvatarUrl(fileID);
    } catch (e) {
      setError(e.message || '头像上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving || uploading) return;
    const name = (nickName || '').trim();
    if (name && name.length < 2) { setError('昵称至少 2 个字'); return; }
    setSaving(true);
    setError('');
    try {
      await saveProfile({ nickName: name, avatarUrl });
      toast('资料已保存');
      back('/profile');
    } catch (e) {
      setError(e.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  const avatar = resolve(avatarUrl);

  return (
    <div className="screen screen-padded edit-page">
      <NavBar title="个人资料" fallback="/profile" />
      <div className="page-lead">
        <div className="small-kicker">MY PROFILE / 个人资料</div>
        <div className="page-title">让邻居认识你<span className="title-period">.</span></div>
        <div className="page-sub">头像与昵称只在「我的」展示，广场和闲置仍保持匿名</div>
      </div>

      <section className="card">
        <div className="card-title">头像</div>
        <div className="avatar-wrap">
          <label className="avatar-button">
            {avatar ? <img className="avatar-image" src={avatar} alt="" /> : <span className="avatar-fallback">{initialOf(nickName.trim())}</span>}
            <input type="file" accept="image/*" onChange={chooseAvatar} hidden />
          </label>
          <div className="avatar-copy">
            <div className="avatar-hint">{uploading ? '头像上传中…' : '点击左侧头像即可更换'}</div>
            {avatarUrl ? <button type="button" className="avatar-remove" onClick={() => setAvatarUrl('')}>移除头像</button> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">昵称</div>
        <input
          className="input"
          value={nickName}
          maxLength={24}
          placeholder="点击填写昵称"
          onChange={event => setNickName(event.target.value)}
        />
        <div className="hint">留空则显示默认称呼；昵称会经过一次内容安全校验。</div>
      </section>

      {error ? <div className="error-line">{error}</div> : null}

      <button type="button" className={`primary-action submit ${saving || uploading ? 'is-disabled' : ''}`} onClick={save}>
        {saving ? '保存中…' : '保存资料'}
      </button>
      <div className="foot-note">资料保存在云端，仅本人可见，不会展示联系方式。</div>
    </div>
  );
}
