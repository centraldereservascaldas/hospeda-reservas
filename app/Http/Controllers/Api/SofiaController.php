<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;

class SofiaController extends Controller
{
    public function chat(Request $request, RateLimiter $limiter): JsonResponse
    {
        $input = $request->validate(['message' => ['required', 'string', 'max:1500'], 'history' => ['nullable', 'array'], 'history.*.role' => ['required_with:history', 'in:user,assistant'], 'history.*.content' => ['required_with:history', 'string', 'max:1200']]);
        $key = 'sofia:'.$request->ip();
        if ($limiter->tooManyAttempts($key, 20)) {
            return response()->json(['success' => false, 'message' => 'Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente novamente.'], 429);
        }
        $limiter->hit($key, 600);
        $history = collect($input['history'] ?? [])->take(-10)->map(fn (array $turn): array => ['role' => $turn['role'], 'content' => trim($turn['content'])])->filter(fn (array $turn): bool => $turn['content'] !== '')->values()->all();
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $script = 'const m=require(process.argv[1]);const c=require(process.argv[2]);process.stdout.write(JSON.stringify(m.buildSofiaFallback(process.argv[3],JSON.parse(process.argv[4]),c)))';
        $process = new Process(['node', '-e', $script, resource_path('data/sofia-concierge.cjs'), resource_path('data/stays-apartments.json'), $input['message'], json_encode($history, JSON_THROW_ON_ERROR)]);
        $process->run();
        $catalogAnswer = $process->isSuccessful() ? json_decode($process->getOutput(), true) : null;
        if (! is_array($catalogAnswer)) {
            return response()->json(['success' => false, 'message' => 'Atendimento indisponível no momento.'], 503);
        }
        if ($catalogAnswer['resolved'] ?? false) {
            unset($catalogAnswer['resolved']);

            return response()->json(['success' => true, ...$catalogAnswer]);
        }

        $apiKey = (string) config('services.openai.api_key');
        if ($apiKey === '') {
            return response()->json(['success' => true, ...array_diff_key($catalogAnswer, ['resolved' => true])]);
        }
        try {
            $response = Http::withToken($apiKey)->acceptJson()->asJson()->connectTimeout(5)->timeout(20)->post('https://api.openai.com/v1/responses', ['model' => config('services.openai.model', 'gpt-4.1-mini'), 'store' => false, 'max_output_tokens' => 500, 'instructions' => 'Você é Sofia, concierge de hospedagem em Caldas Novas. Responda em português brasileiro com simpatia. Não invente disponibilidade nem preços; recomende consultar a busca do site.', 'input' => [...$history, ['role' => 'user', 'content' => trim($input['message'])]]]);
            $text = (string) (collect($response->json('output', []))->flatMap(fn (array $item): array => $item['content'] ?? [])->first(fn (array $item): bool => ($item['type'] ?? '') === 'output_text')['text'] ?? '');
            if ($response->successful() && $text !== '') {
                return response()->json(['success' => true, 'reply' => $text, 'matchedProperties' => [], 'suggestedFilters' => new \stdClass, 'totalFound' => 0, 'assistant' => 'openai']);
            }
        } catch (\Throwable) {
        }

        return response()->json(['success' => true, ...array_diff_key($catalogAnswer, ['resolved' => true])]);
    }
}
