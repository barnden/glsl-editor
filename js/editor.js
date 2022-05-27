import { WebGL2Renderer } from "./WebGL2.js"

class Workspace {
    constructor(renderer, buffer, options) {
        this.renderer = renderer
        this.buffer = buffer
        this.locations = {}

        this.setup(options)
    }

    setup(options) {
        this.shaders = {
            vertex: [options.vertex || "viewport"],
            fragment: [options.fragment]
        }

        this.texture = this.createTexture(options.image)
        this.createProgram()
    }

    createShader(type, name) {
        const gl = this.renderer.gl
        const shader = gl.createShader(type)
        const source = document.getElementById(name).text

        gl.shaderSource(shader, this.includeDefaultHeader(source.trimStart()))
        gl.compileShader(shader)

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw ("[Editor] Failed to compile shaders.\n\n" + gl.getShaderInfoLog(shader))

        return shader
    }

    createProgram() {
        const gl = this.renderer.gl

        this.program = gl.createProgram()

        for (let vertex of this.shaders.vertex)
            gl.attachShader(this.program, this.createShader(gl.VERTEX_SHADER, vertex))

        for (let fragment of this.shaders.fragment)
            gl.attachShader(this.program, this.createShader(gl.FRAGMENT_SHADER, fragment))

        this.link()

        this.addUniform("u_Resolution")
        this.addUniform("u_Mouse")
        this.addUniform("u_Time")
        this.addUniform("u_Frame")
        this.addUniform("u_Image")
        this.addUniform("u_ImageResolution")
        this.addAttrib("i_Position")

        this.vao = this.renderer.createVertexArray([[this.buffer, this.locations.i_Position]])
    }

    addShader(shader) {
        const gl = this.renderer.gl
        const type = (shader[0] == gl.VERTEX_SHADER) ? "vertex" : "fragment"

        this.shaders[type].push(shader[1])

        gl.attachShader(this.program, this.createShader(...shader))
    }

    link() {
        const gl = this.renderer.gl
        gl.linkProgram(this.program)

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw ("[Editor] Failed to add shader to workspace.\n\n" + gl.getShaderInfoLog(shader))
    }

    addUniform(uniform) {
        this.locations[uniform] = this.renderer.gl.getUniformLocation(this.program, uniform)
    }

    addAttrib(attrib) {
        this.locations[attrib] = this.renderer.gl.getAttribLocation(this.program, attrib)
    }

    includeDefaultHeader(shaderCode) {
        const header = [
            "#version 300 es\n",
            "precision highp float;",
            "uniform vec2 u_Resolution;",
            "uniform vec4 u_Mouse;",
            "uniform float u_Time;",
            "uniform float u_Frame;",
            "uniform sampler2D u_Image;",
            "uniform ivec2 u_ImageResolution;",
            "out vec4 o_FragColor;",
        ].join('')

        shaderCode = shaderCode.replace("#define USE_DEFAULT_HEADER", header)

        return shaderCode
    }

    createTexture(imageData) {
        const gl = this.renderer.gl
        const texture = gl.createTexture()

        gl.bindTexture(gl.TEXTURE_2D, texture)

        gl.texImage2D(
            gl.TEXTURE_2D, 0,
            gl.RGBA8, imageData.width, imageData.height,
            0, gl.RGBA, gl.UNSIGNED_BYTE,
            imageData.data
        )

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

        return [texture, imageData.width, imageData.height]
    }

    draw = (gl, draw) => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.texture[0])
        gl.uniform1i(this.locations.u_Image, 0)
        gl.uniform2i(this.locations.u_ImageResolution, this.texture[1], this.texture[2])

        draw(gl)
    }
}

class Editor {
    // image: ImageData
    constructor(image) {
        this.renderer = new WebGL2Renderer("editor", 60, { preserverDrawingBuffer: false })
        this.renderer.addRenderHook(this.render)

        this.setup(image)

        this.mousePosition = [0, 0]
        this.mouseInfo = [0, 0]

        this.renderer.render()
    }

    setup(image) {
        const gl = this.renderer.gl

        const viewport_triangle = new Float32Array([-1., -1., 0., 3., -1., 0., -1., 3., 0.])
        this.buffer = this.renderer.createBuffer(viewport_triangle, gl.STATIC_DRAW)

        this.workspace = new Workspace(this.renderer, this.buffer, {
            fragment: "frag",
            image: image
        })

        gl.bindBuffer(gl.ARRAY_BUFFER, null)
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        this.setupMouseControls()
        this.setupKeyboardControls()
    }

    draw = gl => {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    render = gl => {
        gl.useProgram(this.workspace.program)
        gl.bindVertexArray(this.workspace.vao)

        gl.uniform2f(this.workspace.locations.u_Resolution, gl.canvas.width, gl.canvas.height)
        gl.uniform4f(this.workspace.locations.u_Mouse, ...this.mousePosition, ...this.mouseInfo)
        gl.uniform1f(this.workspace.locations.u_Time, this.renderer.time)
        gl.uniform1i(this.workspace.locations.u_Frame, this.renderer.frameCount)

        this.workspace.draw(gl, this.draw)
    }

    setupMouseControls() {
        this.mouseDown = [false, false, false]

        const getCoordinates = e => {
            const coords = (typeof (e.touches) === "undefined") ? e : e.touches[0]
            const bounding = this.renderer.canvas.getBoundingClientRect()

            return [coords.clientX - bounding.left, coords.clientY - bounding.top]
        }

        const moveHandler = e => this.mousePosition = getCoordinates(e)

        const liftHandler = e => {
            if (e.type === "mouseup") {
                this.mouseDown[e.button] = false
                this.mouseInfo = [this.mouseDown.reduce((acc, cur) => acc |= cur), 0]
            } else {
                this.mouseInfo = [0, 0]
            }
        }

        const pressHandler = e => {
            if (e.type === "mousedown") {
                this.mouseDown[e.button] = true
                this.mouseInfo = [this.mouseDown.reduce((acc, cur) => acc |= cur), 0]
            } else {
                this.mouseInfo = [1, 1]
            }

            this.mousePosition = getCoordinates(e)
        }

        const renderer = this.renderer
        renderer.canvas.addEventListener("contextmenu", e => e.preventDefault())

        renderer.canvas.addEventListener("mousedown", pressHandler)
        renderer.canvas.addEventListener("mousemove", moveHandler)
        document.addEventListener("mouseup", liftHandler)

        renderer.canvas.addEventListener("touchstart", pressHandler)
        renderer.canvas.addEventListener("touchmove", moveHandler)
        document.addEventListener("touchend", liftHandler)
    }

    setupKeyboardControls() {
        document.addEventListener("keydown", e => {
            if (e.key == 'p')
                this.renderer.pauseTime ^= true
        })
    }
}

export { Editor }
