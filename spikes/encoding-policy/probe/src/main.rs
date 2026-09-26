use encoding_rs::{
    EUC_KR, Encoding, EncoderResult, GBK, ISO_8859_2, ISO_8859_15, KOI8_R, SHIFT_JIS, UTF_8,
    UTF_16BE, UTF_16LE, WINDOWS_1250, WINDOWS_1251, WINDOWS_1252,
};

#[derive(Clone, Copy)]
struct Form {
    encoding: &'static Encoding,
    bom: bool,
}

struct Fixture {
    name: String,
    bytes: Vec<u8>,
    truth: Option<Form>,
}

fn encode_strict(text: &str, form: Form) -> Result<Vec<u8>, char> {
    let mut out = Vec::new();
    if form.encoding == UTF_8 {
        if form.bom {
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        }
        out.extend_from_slice(text.as_bytes());
        return Ok(out);
    }
    if form.encoding == UTF_16LE || form.encoding == UTF_16BE {
        let le = form.encoding == UTF_16LE;
        if form.bom {
            out.extend_from_slice(if le { &[0xFF, 0xFE] } else { &[0xFE, 0xFF] });
        }
        for unit in text.encode_utf16() {
            out.extend_from_slice(&if le { unit.to_le_bytes() } else { unit.to_be_bytes() });
        }
        return Ok(out);
    }
    let mut encoder = form.encoding.new_encoder();
    let capacity = encoder
        .max_buffer_length_from_utf8_without_replacement(text.len())
        .unwrap();
    out.reserve(capacity);
    let (result, _read) = encoder.encode_from_utf8_to_vec_without_replacement(text, &mut out, true);
    match result {
        EncoderResult::InputEmpty => Ok(out),
        EncoderResult::Unmappable(c) => Err(c),
        EncoderResult::OutputFull => unreachable!(),
    }
}

fn decode_strict(bytes: &[u8], form: Form) -> Option<String> {
    let body = if form.bom {
        match Encoding::for_bom(bytes) {
            Some((encoding, len)) if encoding == form.encoding => &bytes[len..],
            _ => return None,
        }
    } else {
        bytes
    };
    form.encoding
        .decode_without_bom_handling_and_without_replacement(body)
        .map(|text| text.into_owned())
}

fn policy_signal_only(bytes: &[u8]) -> Result<(Form, String), &'static str> {
    if let Some((encoding, len)) = Encoding::for_bom(bytes) {
        return encoding
            .decode_without_bom_handling_and_without_replacement(&bytes[len..])
            .map(|text| (Form { encoding, bom: true }, text.into_owned()))
            .ok_or("malformed after BOM");
    }
    std::str::from_utf8(bytes)
        .map(|text| (Form { encoding: UTF_8, bom: false }, text.to_owned()))
        .map_err(|_| "no BOM and not UTF-8")
}

fn heuristic(bytes: &[u8]) -> &'static Encoding {
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    detector.guess(None, true)
}

fn line_ending(text: &str) -> &'static str {
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count() - crlf;
    match lf.cmp(&crlf) {
        std::cmp::Ordering::Greater => "LF",
        std::cmp::Ordering::Less => "CRLF",
        std::cmp::Ordering::Equal => "none",
    }
}

fn form_name(form: Form) -> String {
    format!("{}{}", form.encoding.name(), if form.bom { "+BOM" } else { "" })
}

fn crlf(text: &str) -> String {
    text.replace('\n', "\r\n")
}

fn main() {
    let latin_short = "# Café\n\nNaïve résumé — “quotes” cost 10 €.\n";
    let latin_long = "# Notes de réunion\n\nLe comité a décidé de reporter la révision du budget à la semaine prochaine. \
        Les représentants ont souligné que les dépenses liées à l’équipement dépassent déjà les prévisions, \
        et qu’une réévaluation complète sera nécessaire avant l’été.\n\n- Première étape : vérifier les coûts\n- Deuxième étape : présenter un rapport détaillé\n";
    let central_short = "# Zażółć\n\ngęślą jaźń\n";
    let central_long = "# Zápis z porady\n\nVýbor rozhodl, že revize rozpočtu bude odložena na příští týden. \
        Zástupci zdůraznili, že výdaje na vybavení již překračují předpoklady a že před létem bude nutné úplné přehodnocení.\n\n- První krok: ověřit náklady\n- Druhý krok: předložit podrobnou zprávu\n";
    let cyrillic = "# Привет\n\nЭто пример текста на русском языке для проверки кодировки.\n";
    let japanese = "# 日本語\n\nこれは文字コードを確認するためのテキストです。\n";
    let chinese = "# 中文\n\n这是用于检查字符编码的示例文本内容。\n";
    let korean = "# 한국어\n\n이것은 문자 인코딩을 확인하기 위한 예제 텍스트입니다.\n";

    let mut fixtures: Vec<Fixture> = Vec::new();
    let mut push = |name: &str, text: &str, form: Form| {
        for (suffix, body) in [("LF", text.to_owned()), ("CRLF", crlf(text))] {
            fixtures.push(Fixture {
                name: format!("{name} [{suffix}]"),
                bytes: encode_strict(&body, form).expect("fixture text must be representable"),
                truth: Some(form),
            });
        }
    };
    let f = |encoding, bom| Form { encoding, bom };

    push("utf-8 latin", latin_short, f(UTF_8, false));
    push("utf-8+BOM latin", latin_short, f(UTF_8, true));
    push("utf-16le+BOM cjk", japanese, f(UTF_16LE, true));
    push("utf-16be+BOM cjk", japanese, f(UTF_16BE, true));
    push("utf-16le no BOM ascii", "# Title\n\nPlain ASCII.\n", f(UTF_16LE, false));
    push("windows-1252 short", latin_short, f(WINDOWS_1252, false));
    push("windows-1252 long", latin_long, f(WINDOWS_1252, false));
    push("iso-8859-15 short", "# Café 10 €\n", f(ISO_8859_15, false));
    push("windows-1250 short", central_short, f(WINDOWS_1250, false));
    push("windows-1250 long", central_long, f(WINDOWS_1250, false));
    push("iso-8859-2 long", central_long, f(ISO_8859_2, false));
    push("windows-1251", cyrillic, f(WINDOWS_1251, false));
    push("koi8-r", cyrillic, f(KOI8_R, false));
    push("shift_jis", japanese, f(SHIFT_JIS, false));
    push("gbk", chinese, f(GBK, false));
    push("euc-kr", korean, f(EUC_KR, false));
    push("windows-1252 mojibake-looking", "# RÃ©sumÃ©\n", f(WINDOWS_1252, false));
    push("windows-1252 déjà", "déjà\n", f(WINDOWS_1252, false));

    let malformed: [(&str, &[u8]); 6] = [
        ("utf-8 truncated sequence", b"# Caf\xC3"),
        ("utf-8+BOM then invalid byte", b"\xEF\xBB\xBF# \xFF\n"),
        ("utf-16le+BOM odd length", b"\xFF\xFE#\x00A"),
        ("utf-16le+BOM lone surrogate", b"\xFF\xFE\x00\xD8A\x00"),
        ("bytes FF FE (current backend invalid-encoding test)", b"\xFF\xFE"),
        ("binary PNG header", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"),
    ];
    for (name, bytes) in malformed {
        fixtures.push(Fixture { name: name.to_owned(), bytes: bytes.to_vec(), truth: None });
    }

    println!("== Fixture matrix: signal-only policy vs chardetng heuristic ==");
    println!("{:<44} | {:<22} | {:<32} | {:<14} | {}", "fixture", "truth", "signal-only", "heuristic", "truth round trip");
    for fixture in &fixtures {
        let truth = fixture.truth.map(form_name).unwrap_or_else(|| "malformed".into());
        let signal = match policy_signal_only(&fixture.bytes) {
            Ok((form, text)) => {
                let correct = match fixture.truth {
                    Some(truth) => truth.encoding == form.encoding && truth.bom == form.bom,
                    None => false,
                };
                let nul = if text.contains('\0') { " NUL" } else { "" };
                format!("{} {} {}{}", form_name(form), line_ending(&text), if correct { "ok" } else { "WRONG" }, nul)
            }
            Err(reason) => format!("reject: {reason}"),
        };
        let guess = heuristic(&fixture.bytes);
        let guess_mark = match fixture.truth {
            Some(truth) if truth.encoding == guess => "ok",
            Some(_) => "WRONG",
            None => "-",
        };
        let round_trip = match fixture.truth {
            Some(form) => {
                let decoded = decode_strict(&fixture.bytes, form).expect("fixture decodes under its truth");
                let reencoded = encode_strict(&decoded, form).expect("decoded text re-encodes");
                if reencoded == fixture.bytes { format!("byte-exact, {}", line_ending(&decoded)) } else { "DIFFERS".into() }
            }
            None => "-".into(),
        };
        println!("{:<44} | {:<22} | {:<32} | {:<14} | {}", fixture.name, truth, signal, format!("{} {}", guess.name(), guess_mark), round_trip);
    }

    println!("\n== Plausible decodes of the same bytes under other explicit selections ==");
    let ambiguous = [
        ("windows-1252 'déjà'", encode_strict("déjà", f(WINDOWS_1252, false)).unwrap()),
        ("windows-1252 'Café 10 €'", encode_strict("Café 10 €", f(WINDOWS_1252, false)).unwrap()),
        ("shift_jis '日本語のテキスト'", encode_strict("日本語のテキスト", f(SHIFT_JIS, false)).unwrap()),
        ("windows-1252 'RÃ©sumÃ©'", encode_strict("RÃ©sumÃ©", f(WINDOWS_1252, false)).unwrap()),
    ];
    for (name, bytes) in &ambiguous {
        println!("{name}: bytes {:02X?}", bytes);
        for encoding in [UTF_8, WINDOWS_1252, WINDOWS_1250, WINDOWS_1251, ISO_8859_15, SHIFT_JIS, GBK, EUC_KR] {
            match encoding.decode_without_bom_handling_and_without_replacement(bytes) {
                Some(text) => println!("    {:<12} -> {:?}", encoding.name(), text),
                None => println!("    {:<12} -> malformed", encoding.name()),
            }
        }
    }

    println!("\n== Single-byte encodings: all 256 bytes decode strictly and re-encode byte-exact? ==");
    let all_bytes: Vec<u8> = (0..=255u8).collect();
    for encoding in [WINDOWS_1252, WINDOWS_1250, WINDOWS_1251, ISO_8859_2, ISO_8859_15, KOI8_R] {
        let form = f(encoding, false);
        match decode_strict(&all_bytes, form) {
            Some(text) => {
                let exact = encode_strict(&text, form).map(|bytes| bytes == all_bytes);
                println!("{:<12} decodes every byte; re-encode byte-exact: {:?}", encoding.name(), exact);
            }
            None => {
                let failing: Vec<u8> = (0..=255u8)
                    .filter(|b| encoding.decode_without_bom_handling_and_without_replacement(&[*b]).is_none())
                    .collect();
                println!("{:<12} undecodable bytes: {:02X?}", encoding.name(), failing);
            }
        }
    }

    println!("\n== Editing in a character the original encoding cannot represent ==");
    let edited = "# Café\n\nDone ✓ 日本 😀\n";
    for form in [f(WINDOWS_1252, false), f(WINDOWS_1250, false), f(SHIFT_JIS, false), f(UTF_16LE, true), f(UTF_8, true)] {
        let strict = match encode_strict(edited, form) {
            Ok(bytes) => format!("ok ({} bytes)", bytes.len()),
            Err(c) => format!("refused at first unmappable {:?} U+{:04X}", c, c as u32),
        };
        let (lossy, used, had_errors) = form.encoding.encode(edited);
        println!(
            "{:<14} strict: {:<44} | encoding_rs encode(): used {}, had_errors {}, output {:?}",
            form_name(form),
            strict,
            used.name(),
            had_errors,
            String::from_utf8_lossy(&lossy)
        );
    }

    println!("\n== Collecting every unmappable character before saving ==");
    let unmappable: Vec<char> = edited
        .chars()
        .filter(|c| encode_strict(&c.to_string(), f(WINDOWS_1252, false)).is_err())
        .collect();
    println!("windows-1252 cannot represent: {:?}", unmappable);

    println!("\n== Labels a picker would resolve ==");
    for label in ["latin1", "iso-8859-1", "ascii", "cp1252", "utf-16", "utf-8", "shift-jis", "gb2312", "big5", "cp437"] {
        match Encoding::for_label(label.as_bytes()) {
            Some(encoding) => println!("{:<10} -> {} (output encoding {})", label, encoding.name(), encoding.output_encoding().name()),
            None => println!("{:<10} -> unknown label", label),
        }
    }
}
