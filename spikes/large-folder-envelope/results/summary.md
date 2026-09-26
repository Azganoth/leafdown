### Backend scan (release, warm cache)

| Fixture | Entries visited | Directories in tree | Walk ms | Scan name ms | Scan modified ms | Scan type ms | JSON MB (short / long root) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flat-1000 | 2146 | 45 | 4 | 4 (long root 4–5) | 31–35 | 5 | 0.1 / 0.2 |
| shallow-1000 | 2156 | 55 | 6 | 6 (long root 5–6) | 31–33 | 5 | 0.1 / 0.2 |
| deep-1000 | 2346 | 245 | 16 | 16 (long root 21–34) | 52–81 | 17 | 0.2 / 0.3 |
| flat-10000 | 20146 | 45 | 16 | 18 (long root 20–22) | 277–400 | 22 | 0.9 / 2.1 |
| shallow-10000 | 20246 | 145 | 23 | 27 (long root 26–27) | 283–296 | 26 | 1.1 / 2.3 |
| deep-10000 | 22146 | 2045 | 131 | 143 (long root 167–285) | 869–1364 | 338 | 1.8 / 3.3 |
| flat-50000 | 100146 | 45 | 68 | 82 (long root 91–131) | 3184–3376 | 95 | 4.5 / 10.4 |
| shallow-50000 | 100646 | 545 | 104 | 121 (long root 116–173) | 1503–1827 | 119 | 5.6 / 11.5 |
| deep-50000 | 110146 | 10045 | 580 | 592 (long root 717–1519) | 2490–3559 | 637 | 10.1 / 17.2 |

### Navigator functions (Node V8, median of 7)

| Fixture | Parse | File count | Ancestors of last file | Rows collapsed (n) | Rows all expanded (n) | Focused index, last row | Filter `e` | Filter `meeting` | Toggle with all dirs expanded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| flat-1000 | 0.24 | 0.04 | 1.06 | 1.14 (1015) | 1.26 (1045) | 1.08 | 0.93 | 0.12 | 0.19 |
| shallow-1000 | 0.27 | 0.05 | 1.29 | 0.03 (26) | 1.57 (1055) | 1.36 | 1.51 | 0.15 | 0.15 |
| deep-1000 | 0.49 | 0.21 | 1.77 | 0.03 (19) | 2.52 (1245) | 1.53 | 1.85 | 0.43 | 1.5 |
| flat-10000 | 2.11 | 0.36 | 11.38 | 13.62 (10015) | 15.38 (10045) | 10.75 | 9.07 | 0.98 | 0.24 |
| shallow-10000 | 2.58 | 0.58 | 14.55 | 0.16 (116) | 15.4 (10145) | 12.79 | 9.3 | 1.34 | 0.35 |
| deep-10000 | 4.42 | 0.5 | 14.48 | 0.03 (19) | 23.57 (12045) | 18.04 | 18.61 | 4.73 | 6.02 |
| flat-50000 | 12.22 | 2.93 | 54.64 | 64.53 (50015) | 71.32 (50045) | 60.76 | 50.05 | 5.97 | 0.33 |
| shallow-50000 | 11.94 | 2.38 | 67.45 | 0.74 (516) | 75.23 (50545) | 60.56 | 45.85 | 8.84 | 1.09 |
| deep-50000 | 21.59 | 3.9 | 81.07 | 0.03 (19) | 147.19 (60045) | 90.64 | 110.84 | 30.39 | 33.65 |

### Open folder in the release app (ms)

| Fixture | Click → usable | IPC request → response | Body + JSON.parse | Parsed → rendered | Rendered → frame | Click → watcher ready | Longest task | Heap peak / after GC MB | Renderer WS MB | Host peak MB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| flat-1000 | 62 | 12 | 1 | 26 | 14 | 67 | 0 | 10 / 8 | 112 | 45 |
| shallow-1000 | 39 | 15 | 1 | 6 | 10 | 46 | 0 | 14 / 11 | 124 | 45 |
| deep-1000 | 53 | 28 | 1 | 6 | 12 | 60 | 0 | 14 / 11 | 127 | 45 |
| flat-10000 | 58 | 32 | 3 | 10 | 8 | 64 | 0 | 19 / 13 | 132 | 45 |
| shallow-10000 | 68 | 43 | 3 | 6 | 10 | 74 | 0 | 24 / 17 | 129 | 45 |
| deep-10000 | 306 | 270 | 7 | 8 | 15 | 319 | 0 | 25 / 17 | 131 | 45 |
| flat-50000 | 196 | 144 | 12 | 24 | 8 | 206 | 0 | 54 / 26 | 148 | 67 |
| shallow-50000 | 232 | 189 | 14 | 14 | 9 | 246 | 0 | 69 / 39 | 162 | 75 |
| deep-50000 | 1363 | 1262 | 37 | 42 | 13 | 1369 | 51 | 24 / 19 | 123 | 113 |

### Navigator interactions in the release app (ms, click or key → next frame)

| Fixture | Expand one | Collapse one | Expand all | Toggle one with all expanded | Collapse all | Filter keystrokes m,e,e,t,i,n,g | Clear filter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flat-1000 | 9 | 5 | 34 | 9 / 6 | 18 | 17, 10, 4, 4, 4, 5, 4 | 14 |
| shallow-1000 | 7 | 8 | 21 | 9 / 6 | 24 | 16, 10, 5, 4, 4, 5, 4 | 14 |
| deep-1000 | 5 | 4 | 25 | 8 / 6 | 17 | 11, 10, 4, 5, 5, 4, 5 | 8 |
| flat-10000 | 10 | 8 | 29 | 8 / 7 | 28 | 14, 11, 5, 4, 5, 5, 4 | 13 |
| shallow-10000 | 11 | 10 | 25 | 10 / 9 | 17 | 15, 11, 5, 5, 4, 5, 4 | 8 |
| deep-10000 | 8 | 7 | 43 | 21 / 24 | 19 | 28, 17, 9, 10, 10, 10, 10 | 14 |
| flat-50000 | 23 | 20 | 35 | 20 / 19 | 28 | 27, 16, 10, 11, 10, 11, 10 | 21 |
| shallow-50000 | 8 | 9 | 49 | 21 / 18 | 21 | 27, 17, 11, 10, 10, 11, 10 | 14 |
| deep-50000 | 7 | 8 | 120 | 78 / 69 | 25 | 74, 32, 27, 24, 24, 30, 26 | 11 |

### Sort order change in the release app (click → next frame, ms)

| Fixture       | Modified date   | Type            | Name          | Longest task |
| ------------- | --------------- | --------------- | ------------- | ------------ |
| flat-1000     | 52 (IPC 42)     | 40 (IPC 31)     | 39 (IPC 31)   | 0            |
| shallow-1000  | 92 (IPC 78)     | 34 (IPC 25)     | 40 (IPC 29)   | 0            |
| deep-1000     | 100 (IPC 93)    | 35 (IPC 24)     | 46 (IPC 34)   | 0            |
| flat-10000    | 669 (IPC 654)   | 69 (IPC 44)     | 56 (IPC 39)   | 0            |
| shallow-10000 | 766 (IPC 752)   | 58 (IPC 37)     | 50 (IPC 39)   | 0            |
| deep-10000    | 951 (IPC 938)   | 172 (IPC 155)   | 181 (IPC 158) | 0            |
| flat-50000    | 3642 (IPC 3607) | 177 (IPC 141)   | 164 (IPC 126) | 0            |
| shallow-50000 | 3363 (IPC 3322) | 207 (IPC 179)   | 191 (IPC 167) | 0            |
| deep-50000    | 5249 (IPC 5184) | 1209 (IPC 1167) | 886 (IPC 844) | 0            |

### Watcher in the release app

| Fixture | Create ms | Rename ms | Delete ms | 1,000 .md: last write → visible ms | events / scans | Delete that directory ms | 1,000 .txt: events / scans |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flat-1000 | 168 | 167 | 167 | 170 (write 456) | 3217 / 1 | 311 | — |
| shallow-1000 | 168 | 163 | 168 | 185 (write 439) | 3153 / 2 | 333 | — |
| deep-1000 | 180 | 178 | 178 | 187 (write 466) | 3101 / 2 | 333 | — |
| flat-10000 | 193 | 193 | 192 | 197 (write 473) | 3113 / 1 | 354 | 1001 / 2 |
| shallow-10000 | 201 | 205 | 194 | 211 (write 436) | 3163 / 1 | 363 | 1001 / 1 |
| deep-10000 | 319 | 311 | 309 | 326 (write 513) | 3184 / 1 | 500 | 1001 / 2 |
| flat-50000 | 326 | 365 | 319 | 342 (write 506) | 3147 / 1 | 538 | 1001 / 2 |
| shallow-50000 | 365 | 405 | 389 | 378 (write 522) | 3131 / 1 | 618 | 1001 / 2 |
| deep-50000 | 1353 | 1028 | 1028 | 1056 (write 515) | 3143 / 2 | 1169 | 1001 / 1 |

### Other app records

- {"op":"launch","heapMB":7,"hostWorkingSetMB":29,"hostPeakMB":45,"rendererWorkingSetMB":101,"rendererPeakMB":105,"webviewTotalMB":391,"viewport":{"w":800,"h":600,"dpr":1}}
- {"op":"error","message":"Error: Command failed: powershell.exe -NoProfile -Command \n $host_ = Get-Process -Name leafdown-perf -ErrorAction SilentlyContinue | Select-Object -First 1\n    $children = Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*com.azganoth.leafdown.perf*' }\n    $renderer = $children | Where-Object { $_.CommandLine -like '*--type=renderer*' } | ForEach-Object { Get-Process -Id $_.ProcessId } | Sort-Object WorkingSet64 -Descending | Select-Object -First 1\n    $total = ($children | ForEach-Object { (Get-Process -Id $_.ProcessId).WorkingSet64 } | Measure-Object -Sum).Sum\n [pscustomobject]@{\n hostWorkingSetMB = [math]::Round($host_.WorkingSet64 / 1MB); hostPeakMB = [math]::Round($host_.PeakWorkingSet64 / 1MB);\n rendererWorkingSetMB = [math]::Round($renderer.WorkingSet64 / 1MB); rendererPeakMB = [math]::Round($renderer.PeakWorkingSet64 / 1MB);\n webviewTotalMB = [math]::Round($total / 1MB)\n } | ConvertTo-Json -Compress\n at genericNodeError (node:internal/errors:986:15)\n at wrappedFn (node:internal/errors:540:14)\n at checkExecSyncError (node:child_process:942:11)\n at execFileSync (node:child_process:978:15)\n at processMemory (drive.mjs:208:21)\n at openFolder (drive.mjs:268:96)\n at async drive.mjs:476:26"}
- {"op":"launch","heapMB":7,"hostWorkingSetMB":30,"hostPeakMB":47,"rendererWorkingSetMB":99,"rendererPeakMB":104,"webviewTotalMB":388,"viewport":{"w":800,"h":600,"dpr":1}}
- {"fixture":"deep-50000","op":"watch:burst10000","writeMs":5354,"fromFirstWriteMs":6522,"fromLastWriteMs":1168,"blocking":{"count":0,"totalMs":0,"maxMs":0},"events":31183,"eventPaths":31183,"scans":1,"scanMs":[1001]}
- {"fixture":"deep-50000","op":"watch:deleteDir10000","fromDeleteMs":2106,"blocking":{"count":0,"totalMs":0,"maxMs":0},"events":10002,"eventPaths":10002,"scans":2,"scanMs":[1164,853]}
- {"op":"launch","heapMB":7,"hostWorkingSetMB":31,"hostPeakMB":47,"rendererWorkingSetMB":98,"rendererPeakMB":103,"webviewTotalMB":379,"viewport":{"w":800,"h":600,"dpr":1}}
- {"fixture":"flat-1000","op":"watch:burst10000","writeMs":5562,"fromFirstWriteMs":5757,"fromLastWriteMs":196,"blocking":{"count":0,"totalMs":0,"maxMs":0},"events":31576,"eventPaths":31576,"scans":1,"scanMs":[31]}
- {"fixture":"flat-1000","op":"watch:deleteDir10000","fromDeleteMs":2084,"blocking":{"count":0,"totalMs":0,"maxMs":0},"events":10003,"eventPaths":10003,"scans":2,"scanMs":[82,8]}
- {"op":"rapidSwitch","sequence":["shallow-50000","deep-50000","flat-1000"],"lastClickToUsableMs":97,"clicksAtMs":[850,1735,2618],"opens":[{"startMs":858,"durationMs":240},{"startMs":1743,"durationMs":954},{"startMs":2626,"durationMs":71}],"blocking":{"count":0,"totalMs":0,"maxMs":0},"stillFinalAfter8s":true,"openCompletionsMs":[1098,2697,2697]}
- {"op":"error","message":"Error: Error: waitFor timeout\n at check (<anonymous>:46:50)\n at evaluate (drive.mjs:85:11)\n at async keyNavigation (drive.mjs:475:18)\n at async drive.mjs:517:31"}
- {"op":"launch","heapMB":7,"hostWorkingSetMB":28,"hostPeakMB":45,"rendererWorkingSetMB":101,"rendererPeakMB":106,"webviewTotalMB":389,"viewport":{"w":800,"h":600,"dpr":1}}
- {"fixture":"flat-50000","op":"openArticleFromNavigator","ms":249,"blocking":{"count":1,"totalMs":219,"maxMs":219}}
- {"fixture":"flat-50000","op":"keys:beforeReveal","samples":[{"ms":47,"blockingMaxMs":0,"focused":"zettel-f-9993.md"},{"ms":47,"blockingMaxMs":0,"focused":"zettel-f-999.md"},{"ms":47,"blockingMaxMs":0,"focused":"zettel-f-991.markdown"},{"ms":83,"blockingMaxMs":77,"focused":"zettel-f-9907.md"},{"ms":54,"blockingMaxMs":0,"focused":"zettel-f-9900.md"},{"ms":46,"blockingMaxMs":0,"focused":"zettel-f-9876.md"},{"ms":41,"blockingMaxMs":0,"focused":"zettel-f-9853.md"},{"ms":41,"blockingMaxMs":0,"focused":"zettel-f-9848.md"}]}
- {"fixture":"flat-50000","op":"keys:afterReveal","samples":[{"ms":108,"blockingMaxMs":105,"focused":"zettel-f-9993.md"},{"ms":102,"blockingMaxMs":96,"focused":"zettel-f-999.md"},{"ms":101,"blockingMaxMs":96,"focused":"zettel-f-991.markdown"},{"ms":108,"blockingMaxMs":99,"focused":"zettel-f-9907.md"},{"ms":108,"blockingMaxMs":99,"focused":"zettel-f-9900.md"},{"ms":102,"blockingMaxMs":97,"focused":"zettel-f-9876.md"},{"ms":107,"blockingMaxMs":102,"focused":"zettel-f-9853.md"},{"ms":103,"blockingMaxMs":99,"focused":"zettel-f-9848.md"}]}
