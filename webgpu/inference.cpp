#include "llama.h"
#include "ggml-backend.h"
#include <emscripten.h>
#include <cstring>
#include <vector>

namespace {
constexpr int context_size = 8192;
llama_model * model = nullptr;
llama_context * context = nullptr;
llama_sampler * sampler = nullptr;
char piece[1024];
}

extern "C" {
EMSCRIPTEN_KEEPALIVE int load_model(int gpu_layers) {
    llama_backend_init();
    auto params = llama_model_default_params();
#ifdef GGML_USE_WEBGPU
    auto gpu = ggml_backend_dev_by_name("WebGPU");
    if (!gpu) return -1;
    ggml_backend_dev_t devices[] = {gpu, nullptr};
    params.devices = devices;
    params.n_gpu_layers = gpu_layers;
#else
    params.n_gpu_layers = 0;
#endif
    params.load_mode = LLAMA_LOAD_MODE_NONE;
    model = llama_model_load_from_file("/model/translate.gguf", params);
    if (!model) return -2;

    auto config = llama_context_default_params();
    config.n_ctx = context_size;
    config.n_batch = 256;
    config.n_threads = config.n_threads_batch = 1;
    context = llama_init_from_model(model, config);
    if (!context) {
        llama_model_free(model);
        model = nullptr;
        return -2;
    }
    sampler = llama_sampler_init_greedy();
    return 0;
}

EMSCRIPTEN_KEEPALIVE int start_translation(const char * prompt) {
    std::vector<llama_token> tokens(context_size);
    int count = llama_tokenize(llama_model_get_vocab(model), prompt, std::strlen(prompt),
                               tokens.data(), tokens.size(), true, true);
    if (count <= 0 || count >= context_size) return -2;
    llama_memory_clear(llama_get_memory(context), true);
    llama_sampler_reset(sampler);
    for (int offset = 0; offset < count; offset += 256) {
        int length = count - offset < 256 ? count - offset : 256;
        if (llama_decode(context, llama_batch_get_one(tokens.data() + offset, length))) return -1;
    }
    return context_size - count;
}

EMSCRIPTEN_KEEPALIVE int next_token() {
    auto vocab = llama_model_get_vocab(model);
    llama_token token = llama_sampler_sample(sampler, context, -1);
    if (llama_vocab_is_eog(vocab, token) || llama_vocab_is_control(vocab, token)) return 0;
    int length = llama_token_to_piece(vocab, token, piece, sizeof(piece), 0, false);
    if (length <= 0 || llama_decode(context, llama_batch_get_one(&token, 1))) return -1;
    return length;
}

EMSCRIPTEN_KEEPALIVE const char * token_bytes() {
    return piece;
}
}
