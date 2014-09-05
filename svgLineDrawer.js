(function (context) {

    // Options
    // =======
    //
    // method:
    //   * single : Each line is drawn at a time.
    //   * all    : All lines are drawn at once.
    //
    // durationType:
    //   * constant : Every line is drawn at the same speed. Speed is defined
    //                on `speed` property (pathLength/frame).
    //   * fixed    : Total drawing time is fixed, and every line is drawn
    //                at the same speed. Total time is defined on `speed`
    //                property (in milliseconds).

    var defaultOpts = {
        lineColor : '#000',
        method : 'single',
        durationType : 'constant',
        speed : 15
    };

    // svgLineDrawer implementation
    // ============================

    var svgLineDrawer = function (svg, opts) {
        var el = $(svg),
            nonPaths;

        this.opts = $.extend({}, defaultOpts, opts);

        this.svg = el.is('svg') ? el : el.find('svg');
        this.paths = [];
        this.totalPathsLength = 0;

        nonPaths = this.svg[0].querySelectorAll('polygon, polyline, rect, circle, ellipse, line');

        // converts all polygons and polylines to paths
        [].forEach.call(nonPaths, svgLineDrawer.convertToPath);

        this.svg.find('path').each((function (index, path) {
            var instance = new svgDrawerPath(path, this.opts);

            this.totalPathsLength += instance.getTotalLength();

            this.paths.push(instance);
        }).bind(this));

        this.calculatePathDurations();
        this.reset();
    };

    // Static methods
    // --------------

    svgLineDrawer.convertToPath = function (el) {
        var svgNS = el.ownerSVGElement.namespaceURI,
            path = document.createElementNS(svgNS,'path'),
            tag = el.tagName,
            pathdata;

        if (tag === 'polygon' || tag === 'polyline') {
            pathdata = svgLineDrawer.getPolyPathData(el);
        }

        if (tag === 'rect') {
            pathdata = svgLineDrawer.getRectPathData(el);
        }

        if (tag === 'line') {
            pathdata = svgLineDrawer.getLinePathData(el);
        }

        if (tag === 'circle' || tag === 'ellipse') {
            pathdata = svgLineDrawer.getCirclePathData(el);
        }

        path.setAttribute('d', pathdata);
        el.parentNode.replaceChild(path, el);
    };

    svgLineDrawer.getPolyPathData = function (poly) {
        var points = poly.getAttribute('points').split(/\s+|,/),
            x0 = points.shift(), y0=points.shift(),
            pathdata = 'M' + x0 + ',' + y0 + 'L' + points.join(' ');

        if (poly.tagName === 'polygon') {
            pathdata += 'z';
        }

        return pathdata;
    };

    svgLineDrawer.getRectPathData = function (rect) {
        var x0 = rect.getAttribute('x'),
            y0 = rect.getAttribute('y'),
            w = rect.getAttribute('width'),
            h = rect.getAttribute('height'),
            x1 = parseFloat(x0) + parseFloat(w),
            y1 = parseFloat(y0) + parseFloat(h);

        return 'M' + x0 + ',' + y0 + 'H' + x1 + 'V' + y1 + 'H' + x0 + 'V' + y0 + 'z';
    };

    // http://complexdan.com/svg-circleellipse-to-path-converter/
    svgLineDrawer.getCirclePathData = function (circ) {
        var cx = parseFloat(circ.getAttribute('cx')),
            cy = parseFloat(circ.getAttribute('cy')),
            rx = parseFloat(circ.getAttribute('rx') || 0),
            ry = parseFloat(circ.getAttribute('ry') || 0),
            r = parseFloat(circ.getAttribute('r') || 0),
            output = [];

        if (r > 0){
            rx = r;
            ry = r;
        }

        output.push('M' + (cx-rx).toString() + ',' + cy.toString());
        output.push('a' + rx.toString() + ',' + ry.toString() + ' 0 1,0 ' + (2 * rx).toString() + ',0');
        output.push('a' + rx.toString() + ',' + ry.toString() + ' 0 1,0 ' + (-2 * rx).toString() + ',0');

        return output.join('');
    };

    svgLineDrawer.getLinePathData = function (line) {
        var x1 = parseFloat(line.getAttribute('x1')),
            y1 = parseFloat(line.getAttribute('y1')),
            x2 = parseFloat(line.getAttribute('x2')),
            y2 = parseFloat(line.getAttribute('y2'));

        return 'M' + x1 + ',' + y1 + 'L' + x2 + ',' + y2 + 'z';
    };

    // Instance methods
    // ----------------

    svgLineDrawer.prototype.calculatePathDurations = function () {
        var strategy = this.opts.durationType,
            method = this.opts.method,
            speed = this.opts.speed,
            totalFrames;

        // Fixed duration, sequential lines
        if (strategy === 'fixed' && method === 'single') {
            totalFrames = (speed * 60) / 1000;
            lengthStep = Math.ceil(this.totalPathsLength / totalFrames);

            this.paths.forEach(function (path) {
                path.setLengthStep(lengthStep);
            });

            return;
        }

        // Fixed duration, all at once
        if (strategy === 'fixed') {
            this.paths.forEach(function (path) {
                totalFrames = (speed * 60) / 1000;
                path.setLengthStep(Math.ceil(path.getTotalLength() / totalFrames));
            });

            return;
        }

        // Default is 'constant'
        this.paths.forEach(function (path) {
            path.setLengthStep(speed);
        });
    };

    svgLineDrawer.prototype.reset = function () {
        this.paths.forEach(function (path) {
            path.reset();
        });
    };

    svgLineDrawer.prototype.draw = function () {
        if (this.opts.method === 'all') {
            return this.startAllPaths();
        }

        return this.startPath(0);
    };

    svgLineDrawer.prototype.startPath = function (index) {
        this.drawPromise = this.drawPromise || $.Deferred();

        if (index > this.paths.length - 1) {
            return this.drawPromise;
        }

        if (index === this.paths.length - 1) {
            $.when(this.paths[index].start()).done((function () {
                this.drawPromise.resolve();
            }).bind(this));

            return this.drawPromise;
        }

        $.when(this.paths[index].start()).done(this.startPath.bind(this, index + 1));

        return this.drawPromise;
    };

    svgLineDrawer.prototype.startAllPaths = function () {
        var promises = [],
            drawPromise = $.Deferred();

        this.paths.forEach(function (path) {
            promises.push(path.start());
        });

        $.when.apply($, promises).done(drawPromise.resolve.bind(drawPromise));

        return drawPromise;
    };

    // svgDrawerPath implementation
    // ============================

    var svgDrawerPath = function (path, opts) {
        this.path = $(path);
        this.path[0].style.fill = 'none';
        this.opts = opts;
        this.totalLength = this.path[0].getTotalLength();
        this.currentLenth = this.totalLength;
        this.lengthStep = 15;
    };

    // Instance methods
    // ----------------

    svgDrawerPath.prototype.getTotalLength = function () {
        return this.totalLength;
    };

    svgDrawerPath.prototype.setLengthStep = function (lengthStep) {
        return this.lengthStep = lengthStep;
    };

    svgDrawerPath.prototype.reset = function () {
        this.path[0].style.strokeDashoffset = this.totalLength;
        this.path[0].style.strokeDasharray = [this.totalLength, this.totalLength].join(' ');
        this.path.removeAttr('stroke');
        this.path.removeAttr('stroke-miterlimit');
        this.currentLength = this.totalLength;
    };

    svgDrawerPath.prototype.draw = function () {
        this.currentLength -= this.lengthStep;

        if (this.currentLength < 0) {
            this.path[0].style.strokeDashoffset = 0;
            this.stop();
            return;
        }

        this.path[0].style.strokeDashoffset = this.currentLength;

        requestAnimationFrame(this.draw.bind(this));
    };

    svgDrawerPath.prototype.start = function () {
        this.dfd = $.Deferred();

        this.animationId = requestAnimationFrame(this.draw.bind(this));
        this.path[0].style.stroke = this.opts.lineColor;

        return this.dfd;
    };

    svgDrawerPath.prototype.stop = function () {
        cancelAnimationFrame(this.animationId);
        this.dfd.resolve();
    };

    // Module exposure
    // ===============

    context.svgLineDrawer = svgLineDrawer;
})(this);
