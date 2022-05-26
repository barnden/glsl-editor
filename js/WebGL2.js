class WebGL2Renderer {
    constructor(canvas, targetFPS, gl2options) {
        if (typeof canvas === "string")
            this.canvas = document.getElementById(canvas)
        else
            this.canvas = canvas

        this.gl = this.canvas.getContext("webgl2", gl2options)
        this.frameTime = 1000 / targetFPS
        this.frameCount = 0
        this.time = 0
        this.lastFrameTime = performance.now()
        this.startTime = this.lastFrameTime
        this.pauseTime = false

        if (this.gl === null)
            throw "[WebGL2Renderer] WebGL2 context is not supported by the browser."

        this.renderHooks = new Array();
    }

    createBuffer(data, usage) {
        const buf = this.gl.createBuffer()

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf)
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, usage);

        return buf
    }

    createVertexArray(pairs) {
        const va = this.gl.createVertexArray()
        this.gl.bindVertexArray(va)

        for (const [buf, loc] of pairs) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf)
            this.gl.enableVertexAttribArray(loc)
            this.gl.vertexAttribPointer(loc, 3, this.gl.FLOAT, false, 0, 0)
        }

        return va
    }

    transformFeedback(buf) {
        const feed = this.gl.createTransformFeedback()

        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, feed)
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, buf)

        return feed
    }

    createShader(type, name) {
        const shader = this.gl.createShader(type)
        const source = document.getElementById(name).text

        this.gl.shaderSource(shader, source.trimStart())
        this.gl.compileShader(shader)

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
            throw ("[WebGL2Renderer] Failed to compile shaders.\n\n" + this.gl.getShaderInfoLog(shader))

        return shader
    }

    createProgram(shaders, transforms) {
        const program = this.gl.createProgram()

        for (let shader of shaders)
            this.gl.attachShader(program, this.createShader(...shader))

        if (transforms)
            this.gl.transformFeedbackVaryings(program, transforms, this.gl.INTERLEAVED_ATTRIBS)

        this.gl.linkProgram(program)

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
            throw ("[WebGL2Renderer] Failed to link program.\n\n" + this.gl.getShaderInfoLog(shader))

        return program
    }

    addRenderHook(callback) {
        if (typeof callback !== "function")
            throw "[WebGL2Renderer] addRenderHook expected a function object"

        this.renderHooks.push(callback)
    }

    render = _ => {
        const now = performance.now()
        const delta = now - this.lastFrameTime

        if (delta < this.frameTime)
            return requestAnimationFrame(this.render)

        this.gl.clearColor(0., 0., 0., 0.)
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)

        for (let hook of this.renderHooks)
            hook(this.gl);

        if (!this.pauseTime)
            this.time += delta / 1000

        this.frameCount++
        this.lastFrameTime = now

        requestAnimationFrame(this.render)
    }
}

export { WebGL2Renderer }
