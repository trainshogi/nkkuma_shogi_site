var canvas = document.getElementById('canvas1');
var ctx = canvas.getContext('2d');

var cropCanvas = document.getElementById('cropCv');
var cropCtx = cropCanvas.getContext('2d');
//cropCanvas.width = bunny.width;
//cropCanvas.height = bunny.height;
//cropCtx.drawImage(bunny, 0, 0);

var debug = false;

// --------------------------------------------

function rasterizeTriangle(v1, v2, v3, mirror) {
    var fv1 = {
        x: 0,
        y: 0,
        u: 0,
        v: 0
    };
    fv1.x = v1.x;
    fv1.y = v1.y;
    fv1.u = v1.u;
    fv1.v = v1.v;
    ctx.save();
    // Clip to draw only the triangle
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.lineTo(v3.x, v3.y);
    ctx.clip();
    // compute mirror point and flip texture coordinates for lower-right triangle
    if (mirror) {
        fv1.x = fv1.x + (v3.x - v1.x) + (v2.x - v1.x);
        fv1.y = fv1.y + (v3.y - v1.y) + (v2.y - v1.y);
        fv1.u = v3.u;
        fv1.v = v2.v;
    }
    // 
    var angleX = Math.atan2(v2.y - fv1.y, v2.x - fv1.x);
    var angleY = Math.atan2(v3.y - fv1.y, v3.x - fv1.x);
    var scaleX = lengthP(fv1, v2);
    var scaleY = lengthP(fv1, v3);
    var cos = Math.cos,
        sin = Math.sin;
    // ----------------------------------------
    //     Transforms
    // ----------------------------------------
    // projection matrix (world relative to center => screen)
    var transfMatrix = [];
    transfMatrix[0] = cos(angleX) * scaleX;
    transfMatrix[1] = sin(angleX) * scaleX;
    transfMatrix[2] = cos(angleY) * scaleY;
    transfMatrix[3] = sin(angleY) * scaleY;
    transfMatrix[4] = fv1.x;
    transfMatrix[5] = fv1.y;
    ctx.setTransform.apply(ctx, transfMatrix);
    // !! draw !!
    ctx.drawImage(bunny, fv1.u, fv1.v, v2.u - fv1.u, v3.v - fv1.v,
    0, 0, 1, 1);
    //
    ctx.restore();
};



var v1 = {
    x: 100 + 20,
    y: 20,
    u: 0,
    v: 0
};

var v2 = {
    x: 100 + 140,
    y: 50,
    u: bunny.width,
    v: 0
};

var v3 = {
    x: 100 + 10,
    y: 240,
    u: 0,
    v: bunny.height
};

var v4 = {
    x: 100 + 170,
    y: 280,
    u: bunny.width,
    v: bunny.height
};

var mouse = {
    x: 0,
    y: 0,
    down: false,
    dragging: null
};

var cornerPoints = [v1, v2, v3, v4];

setupMouse(canvas, cornerPoints, true);

var cropPoint1 = {
    x: 0,
    y: 0
};

var cropPoint2 = {
    x: bunny.width,
    y: bunny.height
};

var cropPoint3 = {
    x: bunny.width,
    y: 0
};

var cropPoint3 = {
    x: bunny.width,
    y: 0
};


var cropPoint4 = {
    x: 0,
    y: bunny.height
};

var cropPoints = [cropPoint1, cropPoint2,cropPoint3,cropPoint4];

//setupMouse(cropCanvas, cropPoints, true);

function drawCrop() {
    cropCtx.drawImage(bunny, 0, 0);
    drawPoint(cropCtx, cropPoint1);
    drawPoint(cropCtx, cropPoint2);
    cropCtx.strokeStyle = '#FFF';
    cropCtx.strokeRect(cropPoint1.x, cropPoint1.y, cropPoint2.x - cropPoint1.x, cropPoint2.y - cropPoint1.y)
}

function drawPoint(ctx, pt) {
    ctx.beginPath();
        ctx.strokeStyle = '#FFF';
    ctx.arc(pt.x, pt.y, 9, 0, 6.28);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 12, 0, 6.28);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function draw() {
    requestAnimationFrame(draw);
    if (!changed) return;
    changed = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    //if (img.width!=0){
    //    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    //}
    ctx.fillStyle = '#000';
    //ctx.fillText('Grab one of the 4 corners and move the mouse to change the display shape.', 20, 10);
    //ctx.fillText('Below, Grab the top-left or bottom right points to crop the source image', 20, 20);
    updateUVs();
    rasterizeTriangle(v1, v2, v3, false);
    rasterizeTriangle(v4, v2, v3, true);
    if (mouse.dragging) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 5, 0, 6.28);
        ctx.stroke();
    }
    //drawCrop();
};

// draw();

function updateUVs() {
    cornerPoints[0].u = cropPoints[0].x;
    cornerPoints[0].v = cropPoints[0].y;
    cornerPoints[1].u = cropPoints[1].x;
    cornerPoints[1].v = cropPoints[0].y;
    cornerPoints[2].u = cropPoints[0].x;
    cornerPoints[2].v = cropPoints[1].y;
    cornerPoints[3].u = cropPoints[1].x;
    cornerPoints[3].v = cropPoints[1].y;
}

// --------------------------------------------
// mouse handling

var changed = true;

function setupMouse(canvas, pointSet, preventDefault) {
    var rectLeft, rectTop;
    var cssScaleX = canvas.width / canvas.offsetWidth;
    var cssScaleY = canvas.height / canvas.offsetHeight;
    var hook = canvas.addEventListener.bind(canvas);
    var mouseDown = updateMouseStatus.bind(null, true);
    var mouseUp = updateMouseStatus.bind(null, false);
    var mouseOut = function () {
        mouse.down = false;
    };
    //hook('mousedown', mouseDown);
    //hook('mouseup', mouseUp);
    //hook('mouseout', mouseOut);
    //hook('mousemove', updateCoordinates);
    hook('touchstart', mouseDown);
    hook('touchend', mouseUp);
    hook('touchcancel', mouseOut);
    hook('touchmove', updateCoordinates);
    addEventListener('scroll', updateRect);

    function updateMouseStatus(b, e) {
        var previousMouseDown = mouse.down;
        mouse.down = b;
        updateCoordinates(e);

        if (!previousMouseDown && b) {
            console.log(cssScaleX);
            var pt = nearestPoint(pointSet, mouse);
            if (pt) mouse.dragging = pt;
            changed = true;
        }
        if (previousMouseDown && b && mouse.dragging) {
            mouse.dragging.x = mouse.x;
            mouse.dragging.y = mouse.y;
            changed = true;
        }

        if (!b) mouse.dragging = null;

        if (preventDefault) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    function updateCoordinates(e) {
        var touch = e.touches[0] || e.changedTouches[0];
        mouse.x = (touch.clientX - rectLeft);// / cssScaleX;
        mouse.y = (touch.clientY - rectTop);// / cssScaleY;
        if (mouse.dragging) {
            mouse.dragging.x = mouse.x;
            mouse.dragging.y = mouse.y;
            changed = true;
        }
    }

    function updateRect() {
        console.log('updt rect');
        var rect = canvas.getBoundingClientRect();
        rectLeft = rect.left;
        rectTop = rect.top;
    }
    updateRect();
};


// --------------------------------------------
// utilities

function nearestPoint(pointSet, pt) {
    var dist = 1e12,
        res = null;
    for (var __i = 0; __i < pointSet.length; __i++) {
        var thisDist = lengthP(pt, pointSet[__i]);
        if (thisDist < dist) {
            dist = thisDist;
            res = pointSet[__i];
        }
    }
    if (dist < 50) return res;
    return null;
}

function sq(x) {
    return x * x;
}

function lengthP(a, b) {
    return Math.sqrt(sq(a.x - b.x) + sq(a.y - b.y));
}