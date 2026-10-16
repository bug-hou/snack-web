import { useState } from 'react';
import { PageHeader } from '../components/Layout';
import { Chip } from '../components/Bits';
import { redirect } from '../lib/router';
import { invoke, uploadImage } from '../lib/cloud';
import { useCloudImages } from '../lib/useCloudImages';
import { CONDITIONS, MODES } from '../lib/data';
import { toast } from '../lib/ui';

export default function ShareForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetup, setMeetup] = useState('');
  const [price, setPrice] = useState('');
  const [conditionIndex, setConditionIndex] = useState(0);
  const [modeIndex, setModeIndex] = useState(0);
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
        const fileID = await uploadImage(file, 'community');
        setImages(list => (list.length >= 3 ? list : [...list, fileID]));
      }
    } catch (e) {
      setError(e.message || '图片上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (submitting || uploading) return;
    if (!title.trim() || !description.trim() || !meetup.trim()) {
      setError('请填写物品名称、描述和交接地点');
      return;
    }
    const mode = MODES[modeIndex].value;
    let priceCents = 0;
    if (mode === 'sale') {
      priceCents = Math.round(Number(price) * 100);
      if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 1000000) {
        setError('请填写有效的转让价格');
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await invoke('createShare', {
        title: title.trim(),
        description: description.trim(),
        meetup: meetup.trim(),
        condition: CONDITIONS[conditionIndex].value,
        mode,
        priceCents,
        images
      });
      toast('已发布，邻居可看到');
      redirect('/shares');
    } catch (e) {
      setError(e.message || '发布失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen screen-padded form-page">
      <PageHeader title="发布闲置" sub="如实描述成色与瑕疵，让邻居放心接手" />

      <section className="card">
        <div className="card-title">物品名称</div>
        <input className="input" value={title} maxLength={40} placeholder="如 儿童滑板车" onChange={event => setTitle(event.target.value)} />
      </section>

      <section className="card">
        <div className="card-title">物品描述</div>
        <textarea
          className="textarea"
          value={description}
          maxLength={200}
          rows={4}
          placeholder="使用情况、成色、已知瑕疵，越具体越好"
          onChange={event => setDescription(event.target.value)}
        />
      </section>

      <section className="card">
        <div className="card-title">分享方式</div>
        <div className="options">
          {MODES.map((item, index) => (
            <Chip key={item.value} active={modeIndex === index} onClick={() => setModeIndex(index)}>{item.label}</Chip>
          ))}
        </div>
        {MODES[modeIndex].value === 'sale' ? (
          <label className="field inline">
            <span className="label">转让价格</span>
            <input className="input" inputMode="decimal" value={price} placeholder="0.00" onChange={event => setPrice(event.target.value)} />
          </label>
        ) : <div className="hint">免费分享不需要填写价格，交接时请勿收取费用。</div>}
      </section>

      <section className="card">
        <div className="card-title">成色</div>
        <div className="options">
          {CONDITIONS.map((item, index) => (
            <Chip key={item.value} active={conditionIndex === index} onClick={() => setConditionIndex(index)}>{item.label}</Chip>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-title">交接地点</div>
        <input className="input" value={meetup} maxLength={40} placeholder="如 16栋楼下快递柜旁" onChange={event => setMeetup(event.target.value)} />
        <div className="hint">请填写小区公共地点，不要填写门牌号和手机号。</div>
      </section>

      <section className="card">
        <div className="card-title">实物图片（最多3张）</div>
        <div className="image-row">
          {images.map((fileID, index) => {
            const url = resolve(fileID);
            return (
              <div key={fileID} className="image-cell">
                {url ? <img className="image-preview" src={url} alt="" /> : <span className="image-preview pending" />}
                <button type="button" className="image-remove" onClick={() => setImages(list => list.filter((_, i) => i !== index))}>移除</button>
              </div>
            );
          })}
          {images.length < 3 ? (
            <label className="image-add">
              ＋<span>{uploading ? '上传中…' : '添加图片'}</span>
              <input type="file" accept="image/*" onChange={chooseImage} hidden />
            </label>
          ) : null}
        </div>
        <div className="hint">支持 JPG / PNG / WebP，单张不超过 3MB。</div>
      </section>

      {error ? <div className="error-line">{error}</div> : null}

      <button type="button" className="submit-button" onClick={submit} disabled={submitting || uploading}>
        {submitting ? '发布中…' : '发布闲置'}
      </button>
      <div className="foot-note">发布后立即对邻居公开；请不要发布他人物品或违规内容。</div>
    </div>
  );
}
