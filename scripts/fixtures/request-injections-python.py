"""通过本地构建的 dsh 验证 Python SDK 收到持久注入事件及普通回答。"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from deepseek_harness import DeepSeekHarness, DeepSeekHarnessConfig


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--update', action='store_true')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    requests: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            pass

        def do_POST(self) -> None:
            requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            for chunk in [
                {'type': 'message_start', 'message': {'id': 'msg_injection', 'model': 'deepseek-v4-flash', 'usage': {'input_tokens': 5, 'output_tokens': 0}}},
                {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}},
                {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': 'PYTHON_INJECTION_OK'}},
                {'type': 'content_block_stop', 'index': 0},
                {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn'}, 'usage': {'output_tokens': 2}},
                {'type': 'message_stop'},
            ]:
                self.wfile.write(('data: ' + json.dumps(chunk) + '\n\n').encode())

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    worker = threading.Thread(target=server.serve_forever)
    worker.start()
    try:
        with tempfile.TemporaryDirectory(prefix='dsh-python-injections-') as temporary:
            root = Path(temporary)
            patch = root / 'injections.patch.json'
            patch.write_text(json.dumps([
                {'id': 'skill-filesystem', 'config': {'includeDefaultRoots': False}},
                {'id': 'session-persistence-jsonl', 'config': {'root': str(root / 'sessions'), 'compression': 'none'}},
                {'id': 'session-telemetry-otel', 'disabled': True},
                {'id': 'session-log-deepseek', 'config': {'enabled': False}},
                {'insert': [{'id': 'test-injections', 'name': str(repo / 'snapshots/sdk/request-injections/injection-producer.mjs')}]},
            ]))
            env = {
                'DSH_HOME': str(root / 'home'), 'DSH_AGENTS_HOME': str(root / 'agents'),
                'DSH_PERMISSION_MODE': 'danger-full-access', 'DSH_TELEMETRY_DISABLED': '1',
                'DEEPSEEK_API_KEY': 'local-test-only',
                'DEEPSEEK_BASE_URL': f'http://127.0.0.1:{server.server_port}',
            }
            with DeepSeekHarness(
                DeepSeekHarnessConfig(cwd=str(root), env=env, request_timeout_seconds=30),
                _launch_args=(args.node, str(repo / 'apps/cli/lib/bin.js'), '--profile', 'sdk', '--patch', str(patch)),
            ) as harness:
                result = harness.run('请回复验证标记。')
                projection = {
                    'finalResponse': result.final_response,
                    'finishReason': result.finish_reason,
                    'modelRoles': [[m['role'] for m in request['messages']] for request in requests],
                    'modelSystemPresent': [bool(request.get('system')) for request in requests],
                    'injectionEvents': [e['data'] for e in result.events if e['type'] == 'request/injections'],
                    'assistantOutputs': [e['data']['message']['content'] for e in result.events if e['type'] == 'assistant/message'],
                }
                continuations = [harness.run('继续回复验证标记。', session_id=result.session_id) for _ in range(2)]
                for run in continuations:
                    assert run.finish_reason == 'completed', run.finish_reason
                    assert run.final_response == 'PYTHON_INJECTION_OK', run.final_response
                projection['requestHeaders'] = [
                    [e['data']['reason'] for e in run.events if e['type'] == 'request/header']
                    for run in [result, *continuations]
                ]
                assert len(requests) == 3
            logs = list((root / 'sessions').rglob('session.v4.jsonl'))
            assert len(logs) == 1, '缺少持久 V4 会话'
            rows = [json.loads(line) for line in logs[0].read_text().splitlines()]
            persisted = [e['data'] for e in rows if e['type'] == 'request/injections']
            assert persisted == projection['injectionEvents'] and len(persisted) == 1
            assert [e['data']['reason'] for e in rows if e['type'] == 'request/header'] == ['initial']
            expected = repo / 'scripts/snapshots/python-sdk-single-exe/request-injections/projection.json'
            if args.update:
                expected.parent.mkdir(parents=True, exist_ok=True)
                expected.write_text(json.dumps(projection, ensure_ascii=False, indent=2) + '\n')
            assert projection == json.loads(expected.read_text()), json.dumps(projection, ensure_ascii=False)
            print('Python SDK 注入、模型请求、通知与持久日志验证通过。')
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


if __name__ == '__main__':
    main()
