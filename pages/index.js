import Head from 'next/head';
import Script from 'next/script';

export default function Home() {
  return (
    <>
      <Head>
        <title>Shogiban to Kif developed by えぬっくま</title>
        <meta name="descriotion" content="将棋盤画像認識サイト。写真を撮ってKIF形式局面を作成しよう！" />
        {/* Bootstrap CSS from CDN */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.1.1/dist/css/bootstrap.min.css" />
        <link rel="stylesheet" href="https://gitcdn.github.io/bootstrap-toggle/2.2.2/css/bootstrap-toggle.min.css" />
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" />
        <link rel="stylesheet" href="/css/style.css" />
        <link rel="stylesheet" href="/css/loader.css" />
        <link rel="stylesheet" href="/css/faq.css" />
        <link rel="stylesheet" href="/css/shogiban.css" />
      </Head>

      {/* Main content basically copied from old index.html */}
      <p className="lead">
        <div style={{display: 'none', textAlign: 'center'}}>Shogiban to Kif developed by えぬっくま</div>
        <div style={{display: 'none', textAlign: 'center'}}>将棋盤の画像認識サイトです。写真を撮ってKIF形式局面を作成しよう！</div>
        <img src="/img/SHOGIWEB_TITLE.png" width="100%" alt="title" />
        <img id="howtoimg" src="/img/shogi_intro.png" width="100%" height="auto" alt="intro" />
        <div id="kekka_text" style={{display: 'none', textAlign: 'center'}}>認識結果</div>
        <textarea id="board" style={{display: 'none'}} defaultValue="" />
        <div id="board_img" style={{display: 'none'}}>
          {/* shogiban.html will be loaded here via jQuery */}
        </div>
        <div id="link_btn" style={{textAlign: 'center', margin: '10px 0px', display: 'none'}}>
          <div className="text-muted">検討アプリ</div>
          <button type="button" className="btn" onClick={() => jump_piyo()}><img src="/img/piyo_link.png" alt="piyo" height="25" /></button>
          <button type="button" className="btn" onClick={() => jump_kento()}><img src="/img/kento.png" alt="kento" height="25" /></button>
        </div>
        <div id="copy_btn" style={{textAlign: 'center', margin: '10px 0px', display: 'none'}}>
          <div className="text-muted">他アプリ用</div>
          <button id="format" type="button" className="btn btn-primary dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">kif</button>
          <ul className="dropdown-menu">
              <li><button className="dropdown-item" value="kif">kif</button></li>
              <li><button className="dropdown-item" value="sfen">sfen</button></li>
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => clip_text()}><i className="fa fa-copy" aria-hidden="true"></i></button>
          <button type="button" className="btn btn-primary" onClick={() => save_text()}><i className="fa fa-save" aria-hidden="true"></i></button>
        </div>
        <div id="guruguru" className="loader" style={{display: 'none'}}>Loading...</div>
        <img id="reco_err_img" style={{display: 'none', margin: 'auto'}} src="/img/reco_err.png" width="80%" alt="error" />
        <div id="again" style={{textAlign: 'center', display: 'none'}}><button type="button" className="btn btn-primary" onClick={() => again()}>Again?</button></div>
      </p>

      <form id="myform" className="form-inline" style={{textAlign: 'center', marginBottom: '1rem'}} method="post" encType="multipart/form-data" name="input_form" onSubmit={() => get_js_variable()}>
        <div className="form-group" style={{margin: '0px auto'}}>
          <div className="input-group .center-block" style={{marginLeft: 'auto', marginRight: 'auto'}}>
            <input type="file" name="upfile" id="upfile" style={{display: 'none'}} accept="image/*" capture="camera" />
            <span className="input-group-btn" style={{marginRight: '1rem'}}>
              <button className="btn btn-primary" type="button" onClick={() => { set_camera(); document.getElementById('upfile').click(); }}><i className="fa fa-camera" aria-hidden="true"></i></button>
            </span>
            <span className="input-group-btn" style={{marginRight: '1rem'}}>
              <button className="btn btn-primary" type="button" onClick={() => { set_library(); document.getElementById('upfile').click(); }}><i className="fa fa-image" aria-hidden="true"></i></button>
            </span>
            <input type="checkbox" id="sengo-event" defaultChecked data-toggle="toggle" data-on="先手番" data-off="後手番" data-onstyle="success" data-offstyle="warning" />
            <button type="button" className="btn btn-danger" style={{marginLeft: '1rem'}} onClick={() => file_upload()}>変換</button>
            <input type="hidden" name="hidden_rotate" value="" />
            <input type="hidden" name="hidden_sengo" value="" />
          </div>
        </div>
      </form>

      <div id="pic1_parent" className="contents">
        <img id="pic1" alt="" />
      </div>

      <p>Thank you!</p>
      <div id="back"><button type="button" className="btn btn-primary" onClick={() => clear_form_inner()}>Clear</button></div>

      <div id="tmpfoot">
        <br />
        {/* FC2 counter */}
        <script language="javascript" type="text/javascript" src="//counter1.fc2.com/counter.php?id=33316434&main=1"></script>
        <noscript><img src="//counter1.fc2.com/counter_img.php?id=33316434&main=1" alt="counter" /></noscript>
        {/* FC2 counter end */}
        人目の訪問です。<br />
        <button className="btn btn-default faq" onClick={() => location.href='./faq.html'}>FAQ</button>
        <br /><a href="https://twitter.com/share?ref_src=twsrc%5Etfw" className="twitter-share-button" data-text="写真1枚で簡単KIF作成！" data-url="https://shogi.nkkuma.tokyo" data-hashtags="えぬっくま" data-show-count="false">Tweet</a>
        <script async src="https://platform.twitter.com/widgets.js" charSet="utf-8"></script>
        <p><font size="1">このサービスで撮影頂いた画像は認識率向上を<br />目的としてサーバに保存されます。ご了承下さい。</font></p>
        <br />開発：nkkuma　twitter始めました<br />
        <a href="https://twitter.com/nkkuma_service?ref_src=twsrc%5Etfw" className="twitter-follow-button" data-show-count="false">Follow @nkkuma_service</a>
        <script async src="https://platform.twitter.com/widgets.js" charSet="utf-8"></script>
        <a className="twitter-timeline" height="400px" href="https://twitter.com/nkkuma_service?ref_src=twsrc%5Etfw">Tweets by nkkuma_service</a> <script async src="https://platform.twitter.com/widgets.js" charSet="utf-8"></script>
        {/*<a href="//af.moshimo.com/af/c/click?a_id=1076682&p_id=1555&pc_id=2816&pl_id=22733&guid=ON" target="_blank" rel="nofollow"><img src="//image.moshimo.com/af-img/0866/000000022733.jpg" width="234" height="60" style={{border:'none'}}></a><img src="//i.moshimo.com/af/i/impression?a_id=1076682&p_id=1555&pc_id=2816&pl_id=22733" width="1" height="1" style={{border:'none'}} />*/}
      </div>

      {/* External library scripts */}
      <Script src="https://code.jquery.com/jquery-3.6.0.min.js" strategy="beforeInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.12.9/umd/popper.min.js" integrity="sha384-ApNbgh9B+Y1QKtv3Rn7W3mgPxhU9K/ScQsAP7hUibX39j7fakFPskvXusvfa0b4Q" crossOrigin="anonymous" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@4.1.1/dist/js/bootstrap.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/exif-js" strategy="afterInteractive" />
      <Script src="/js/megapix-image.js" strategy="afterInteractive" />
      <Script src="https://cdn.rawgit.com/blueimp/JavaScript-Load-Image/v2.6.2/js/load-image.all.min.js" strategy="afterInteractive" />
      <Script src="https://gitcdn.github.io/bootstrap-toggle/2.2.2/js/bootstrap-toggle.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/gh/fengyuanchen/compressorjs/dist/compressor.min.js" strategy="afterInteractive" />
      <Script src="/js/makecanvas.js" strategy="afterInteractive" />
      <Script src="/js/util.js" strategy="afterInteractive" />
      <Script src="/js/main_ngrok.js" strategy="afterInteractive" />
    </>
  );
}
