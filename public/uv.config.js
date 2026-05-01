self.__uv$config = {
    prefix: '/uv/service/',
    bare: 'https://tomp.app/', // استخدمنا Bare Server جاهز عشان نسرع الشغل
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: '/uv/uv.handler.js',
    client: '/uv/uv.client.js',
    bundle: '/uv/uv.bundle.js',
    config: '/uv.config.js',
    sw: '/uv/sw.js',
};

