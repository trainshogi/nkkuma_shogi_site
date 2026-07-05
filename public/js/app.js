// 年号
document.getElementById('y').textContent = new Date().getFullYear();

// グローバル保持（認識結果）
window.__kifText = "";
window.__sfenText = "";
var result_json = "";

// プレビュー管理
const previewSection = document.getElementById('previewSection');
const previewImg     = document.getElementById('previewImg');
const lb             = document.getElementById('imgLightbox');
const lbImg          = document.getElementById('lightboxImg');
const lbClose        = document.getElementById('lbClose');
let _objectURL = null;

function showPreview(file){
  try{
    if(_objectURL) URL.revokeObjectURL(_objectURL);
    _objectURL = URL.createObjectURL(file);
    previewImg.src = _objectURL;
    previewSection.style.display = 'block';
  }catch(e){
    console.warn('preview failed:', e);
    previewSection.style.display = 'none';
  }
}
function clearPreview(){
  if(_objectURL){ URL.revokeObjectURL(_objectURL); _objectURL = null; }
  previewImg.removeAttribute('src');
  previewSection.style.display = 'none';
}

// クリックでライトボックス
previewImg?.addEventListener('click', ()=>{
  if(!previewImg.src) return;
  lbImg.src = previewImg.src;
  lb.classList.add('show');
  lb.setAttribute('aria-hidden','false');
});
lb.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
lbClose.addEventListener('click', closeLightbox);
window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeLightbox(); });
function closeLightbox(){
  lb.classList.remove('show');
  lb.setAttribute('aria-hidden','true');
  lbImg.removeAttribute('src');
}

// ファイル選択
const fileInfoSpan = document.getElementById('fileInfo').querySelector('span');
document.getElementById('btnCamera').onclick = () => document.getElementById('cameraInput').click();
document.getElementById('btnFile').onclick   = () => document.getElementById('fileInput').click();
['cameraInput','fileInput'].forEach(id=>{
  document.getElementById(id).onchange = e=>{
    const f = e.target.files?.[0];
    if(!f) return;
    window.__selectedFile = f;
    document.getElementById('fileInfo').style.display='block';
    fileInfoSpan.textContent = `${f.name} (${Math.round(f.size/1024)}KB)`;
    showPreview(f);
  };
});

// ドロップ
const dz = document.getElementById('dropZone');
['dragenter','dragover','dragleave','drop'].forEach(ev=>{
  dz.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); }, false);
});
dz.ondragover = ()=> dz.style.borderColor = '#94a3b8';
dz.ondragleave= ()=> dz.style.borderColor = 'var(--border)';
dz.ondrop = e=>{
  dz.style.borderColor = 'var(--border)';
  const f = e.dataTransfer.files?.[0]; if(!f) return;
  window.__selectedFile = f;
  document.getElementById('fileInfo').style.display='block';
  fileInfoSpan.textContent = `${f.name} (${Math.round(f.size/1024)}KB)`;
  showPreview(f);
};

// 先手後手
let turn = null;
function updateTurnUI(){
  document.getElementById('turnInfo').textContent = turn ? (turn==='sente'?'先手を選択中':'後手を選択中') : '未選択';
  document.getElementById('btnSente').classList.toggle('primary', turn==='sente');
  document.getElementById('btnGote').classList.toggle('primary', turn==='gote');
}
document.getElementById('btnSente').onclick = ()=>{ turn='sente'; updateTurnUI(); };
document.getElementById('btnGote').onclick = ()=>{ turn='gote'; updateTurnUI(); };


    // ================================
    // 認識API呼び出し
    // ================================
    async function runRecognition(file, turn, opts = {}) {
    const {
      rotate = "0",   // hidden_rotate: "0", "90", "180", "270" など（必要に応じてUI接続）
      mode   = "all", // "waku" | "koma" | "koma-ban" | "koma-mochi" | "all"
      points = null   // [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] or null
    } = opts;
  
    const fd = new FormData();
    fd.append('upfile', file);
    fd.append('hidden_rotate', String(rotate));
    fd.append('hidden_sengo',  turn === 'sente' ? 'true' : 'false');
    if (mode)   fd.append('mode', mode);
  
    // points は mode が "koma" / "koma-ban" / "koma-mochi" の場合に必須（API仕様）
    if (points && (mode === 'koma' || mode === 'koma-ban' || mode === 'koma-mochi')) {
      // API側は文字列で受け取り（例："[[x1,y1],[x2,y2],...]"）
      fd.append('points', JSON.stringify(points));
    }
  
    const res = await fetch('https://mha3ss6085.execute-api.ap-northeast-1.amazonaws.com/recognize', {
      method: 'POST',
      body: fd
    });
  
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      console.log(t)
    }
    resjson = await res.json();
    // result_place.textContent = json_to_kif(resjson);
    // disp_result(result);
    // disp_koma(result);
    disp_koma_json(resjson);
  
    // 例）{"kif":"...", "sfen":"..."} / {"kifu":"..."} / {"kif_text":"..."} などを想定
    const kifText  = json_to_kif(resjson);
    const sfenText = json_to_sfen(resjson);
  
    return { resjson, kifText, sfenText };
  }
  
  // ================================
  // 認識ボタンの処理（置き換え）
  // ================================
  document.getElementById('btnRun').onclick = async ()=>{
    const file = window.__selectedFile;
    if(!file){ alert('画像を選択してください'); return; }
    if(!turn){ alert('先手/後手を選択してください'); return; }
  
    document.getElementById('resultEmpty').style.display='block';
    document.getElementById('resultEmpty').textContent='認識中…';
    document.getElementById('resultArea').style.display='none';
    var result_img = document.getElementById('board_img');
  
    try{
      // ぐるぐるを表示
      // hide_result();
      result_img.style.display="none";
      // 必要に応じて rotate / mode / points を渡す
      // 例: const opts = { rotate: "0", mode: "all", points: null };
      const { resultresjson_json, kifText, sfenText } = await runRecognition(file, turn, { rotate: "0", mode: "all" });
  
      // 何も返らなかった場合でも安全に対処
      window.__kifText  = kifText  || '';
      window.__sfenText = sfenText || '';
      result_json = resjson || '';
  
      // 画面はKIFタブ基準で表示（必要なら形式選択に合わせて表示を切替してもOK）
      // document.getElementById('kif').textContent = window.__kifText || '(KIFが取得できませんでした)';
      document.getElementById('resultEmpty').style.display='none';
      document.getElementById('resultArea').style.display='block';

      // ぐるぐるの非表示
      // 結果部分の表示
      result_img.style.display="block";
    }catch(e){
      console.error(e);
      // うまくいかなかった表示
      reco_err();
      document.getElementById('resultEmpty').textContent = '認識に失敗しました：' + e.message;
    }
  };

// クリア
document.getElementById('btnClear').onclick = ()=>{
  window.__selectedFile = null;
  window.__kifText = ""; window.__sfenText = "";
  document.getElementById('fileInfo').style.display='none';
  document.getElementById('cameraInput').value='';
  document.getElementById('fileInput').value='';
  turn=null; updateTurnUI();
  document.getElementById('resultArea').style.display='none';
  document.getElementById('resultEmpty').style.display='block';
  document.getElementById('resultEmpty').textContent='まだ結果はありません。';
  clearPreview();
};

// コピー形式選択
let copyFormat = 'kif';
const fmtGroup = document.getElementById('formatGroup');
fmtGroup.addEventListener('change', (e)=>{
  if(e.target && e.target.name==='fmt'){
    copyFormat = e.target.value;
    fmtGroup.querySelectorAll('.fmt').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
  }
});
// 初期active整合
fmtGroup.querySelectorAll('.fmt').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));

// コピー
document.getElementById('btnCopy').onclick = async ()=>{
  const kif  = json_to_kif(result_json) || '';
  const sfen = json_to_sfen(result_json) || '';
  const text = (copyFormat==='sfen') ? sfen : kif;
  if(!text){
    alert((copyFormat==='sfen'?'SFEN':'KIF')+' がまだ生成されていません。先に「変換」を実行してください。');
    return;
  }
  try{
    await navigator.clipboard.writeText(text);
    alert((copyFormat==='sfen'?'SFEN':'KIF')+' をコピーしました');
  }catch(e){
    const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    alert((copyFormat==='sfen'?'SFEN':'KIF')+' をコピーしました');
  }
};

// シェア
(function(){
  const url = location.href.split('#')[0];
  const text = '写真1枚で簡単KIF作成！';
  const via  = 'nkkuma_service';
  const tw   = new URL('https://twitter.com/intent/tweet');
  if(text) tw.searchParams.set('text', text);
  if(url)  tw.searchParams.set('url', url);
  if(via)  tw.searchParams.set('via', via);
  document.getElementById('share-x').href = tw.toString();
  document.getElementById('share-fb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
})();

// ===== オンボーディング（コーチマーク） =====
(function(){
  const LS_KEY = 'onboard-v1';
  const overlay = document.getElementById('coachOverlay');
  const stepEl  = overlay.querySelector('.coach-step');
  const btnNext = document.getElementById('coachNext');
  const btnSkip = document.getElementById('coachSkip');
  const fab     = document.getElementById('helpFab');

  const steps = [
    { sel: '#step1 .row, #dropZone', html: 'まずは <strong>画像を用意</strong> します。<br>撮影ボタンか「画像を選ぶ」、または下の枠にドロップできます。' },
    { sel: '#step2 .row',            html: '<strong>先手 / 後手</strong> を選びます。' },
    { sel: '#step3 .row',            html: '準備ができたら <strong>「変換」</strong> を押して認識を開始します。' }, 
    { sel: '#step5 .considerapps .btn',
      html: '結果が出たら、<strong>検討アプリ</strong>へ直接飛べます。<br>例：<strong>ぴよ将棋</strong> / <strong>KENTO</strong>（新しいタブ/アプリで開きます）。' },
    { sel: '#step5 .format, #btnCopy',
      html: '他アプリ用に、<strong>KIF / SFEN</strong> を選んで <strong>コピー</strong> できます。' },
  ];
  let idx = 0;
  let currentTargets = [];

  function highlight(selector){
    currentTargets.forEach(el => el.classList.remove('__coach-target'));
    currentTargets = [];
    const list = document.querySelectorAll(selector);
    list.forEach(el => el.classList.add('__coach-target'));
    currentTargets = Array.from(list);
    if(currentTargets[0]) currentTargets[0].scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function showStep(i){
    idx = i;
    stepEl.innerHTML = steps[idx].html;
    highlight(steps[idx].sel);
    btnNext.textContent = (idx === steps.length - 1) ? '完了' : '次へ';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
  }

  function closeCoach(){
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    currentTargets.forEach(el => el.classList.remove('__coach-target'));
    currentTargets = [];
  }

  btnNext.addEventListener('click', ()=>{
    if(idx < steps.length - 1) showStep(idx + 1);
    else{ localStorage.setItem(LS_KEY, 'done'); closeCoach(); }
  });
  btnSkip.addEventListener('click', ()=>{
    localStorage.setItem(LS_KEY, 'done');
    closeCoach();
  });
  fab.addEventListener('click', ()=> showStep(0));

  window.addEventListener('DOMContentLoaded', ()=>{
    if(localStorage.getItem(LS_KEY) !== 'done'){
      setTimeout(()=>showStep(0), 300);
    }
  });
})();
