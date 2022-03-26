$("#canvas").on('touchmove.noScroll', function(e) {
    e.preventDefault();
});

function stopDefault(event) {
    if (event.touches[0].target.tagName.toLowerCase() == "li") {return;}
    if (event.touches[0].target.tagName.toLowerCase() == "input") {return;}

    event.preventDefault();
}

// タッチイベントの初期化
document.addEventListener("touchstart", stopDefault, false);
document.addEventListener("touchmove", stopDefault, false);
document.addEventListener("touchend", stopDefault, false); 
// ジェスチャーイベントの初期化
document.addEventListener("gesturestart", stopDefault, false);
document.addEventListener("gesturechange", stopDefault, false);
document.addEventListener("gestureend", stopDefault, false); 