import { useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Chip } from '../components/Bits';
import { back, redirect } from '../lib/router';
import { invoke, uploadImage } from '../lib/cloud';
import { useCloudImages } from '../lib/useCloudImages';
import { POST_BOARDS } from '../lib/data';
import { toast, confirm } from '../lib/ui';

export default function ForumPost() {
  const [board, setBoard] = useState('chat');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const resolve = useCloudImages(images);

  async function chooseImage(event) {
    const files = Array.from(event.target.files || []).slice(0, 3 - images.length);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const fileID = await uploadImage(file, 'forum');
        setImages(list => (list.length >= 3 ? list : [...list, fileID]));
      }
    } catch (e) {
      setError(e.message || '图片上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  async function goBack() {
    if (title || content || images.length) {
      const ok = await confirm({
        title: '放弃这篇帖子',
        content: '已填写的内容不会保存。',
        confirmText: '放弃',
        danger: true
      });
      if (!ok) return;
    }
    back('/forum');
  }

  async function submit() {
    if (submitting || uploading) return;
    if (!title.trim()) { setError('请先填写标题'); return; }
    if (!content.trim()) { setError('请先填写正文内容'); return; }
    setSubmitting(true);
    setError('');
    try {
      await invoke('createPost', { board, title: title.trim(), content: content.trim(), images });
      toast('已发布到广场');
      redirect('/forum');
    } catch (e) {
      setError(e.message || '发布失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen screen-padded form-page">
      <PageHeader title="发布帖子" sub="写下想说的话，邻居们在广场就能看到" />

      <section className="card">
        <div className="card-title">选择板块</div>
        <div className="options">
          {POST_BOARDS.map(item => (
            <Chip key={item.id} active={board === item.id} onClick={() => setBoard(item.id)}>{item.name}</Chip>
          ))}
        </div>
        {board === 'notice' ? <div className="field-hint">社区公告由社区管理员发布，普通邻居发布的公告会被移入闲聊板块。</div> : null}
      </section>

      <section className="card">
        <div className="card-title">标题</div>
        <input
          className="input"
          value={title}
          maxLength={40}
          placeholder="一句话说清是什么事"
          onChange={event => setTitle(event.target.value)}
        />
        <div className="counter">{title.length}/40</div>
      </section>

      <section className="card">
        <div className="card-title">正文</div>
        <textarea
          className="textarea"
          value={content}
          maxLength={1000}
          rows={6}
          placeholder="尽量写清时间、地点和需要的帮助"
          onChange={event => setContent(event.target.value)}
        />
        <div className="counter">{content.length}/1000</div>
      </section>

      <section className="card">
        <div className="card-title">配图 <span className="label-note">选填，最多 3 张</span></div>
        <div className="image-row">
          {images.map((fileID, index) => {
            const url = resolve(fileID);
            return (
              <div key={fileID} className="image-box">
                {url ? <img className="image-preview" src={url} alt="" /> : <span className="image-preview pending" />}
                <button type="button" className="image-remove" onClick={() => setImages(list => list.filter((_, i) => i !== index))}>×</button>
              </div>
            );
          })}
          {images.length < 3 ? (
            <label className="image-add">
              ＋
              <input type="file" accept="image/*" onChange={chooseImage} hidden />
            </label>
          ) : null}
        </div>
        {uploading ? <div className="field-hint">图片上传中…</div> : null}
      </section>

      <section className="rules-card">
        <div className="rules-title">发布须知</div>
        <div className="rule-line">· 只发邻里信息交流，不发商品交易、广告、二维码、手机号或微信群。</div>
        <div className="rule-line">· 不使用真实姓名与门牌号，广场只显示匿名昵称。</div>
        <div className="rule-line">· 涉及线下见面请在小区公共区域，并自行注意安全。</div>
      </section>

      {error ? <div className="error-line">{error}</div> : null}

      <div className="form-footer">
        <button type="button" className={`submit-button ${submitting || uploading ? 'disabled' : ''}`} onClick={submit}>
          {submitting ? '正在发布…' : '发布到广场'}
        </button>
        <button type="button" className="cancel-button" onClick={goBack}>取消</button>
      </div>
    </div>
  );
}
