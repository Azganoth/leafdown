use encoding_rs::{
    BIG5, EUC_JP, EUC_KR, Encoding, GB18030, GBK, SHIFT_JIS, WINDOWS_874,
    WINDOWS_1250, WINDOWS_1251, WINDOWS_1252, WINDOWS_1253, WINDOWS_1254, WINDOWS_1255,
    WINDOWS_1256, WINDOWS_1257, WINDOWS_1258,
};

fn reencode(encoding: &'static Encoding, text: &str) -> Option<Vec<u8>> {
    let mut encoder = encoding.new_encoder();
    let mut out = Vec::with_capacity(text.len() * 4 + 16);
    let (result, _) = encoder.encode_from_utf8_to_vec_without_replacement(text, &mut out, true);
    (result == encoding_rs::EncoderResult::InputEmpty).then_some(out)
}

fn main() {
    println!("== Two-byte sequences: decodable pairs whose strict re-encode differs ==");
    for encoding in [SHIFT_JIS, EUC_JP, GBK, GB18030, BIG5, EUC_KR] {
        let mut decodable = 0;
        let mut differs = 0;
        let mut samples = Vec::new();
        for lead in 0x80u8..=0xFF {
            for trail in 0x40u8..=0xFE {
                let bytes = [lead, trail];
                let Some(text) = encoding.decode_without_bom_handling_and_without_replacement(&bytes)
                else {
                    continue;
                };
                decodable += 1;
                if reencode(encoding, &text).as_deref() != Some(&bytes[..]) {
                    differs += 1;
                    if samples.len() < 3 {
                        samples.push(format!("{:02X}{:02X}->{:?}", lead, trail, text));
                    }
                }
            }
        }
        println!(
            "{:<10} decodable pairs {:>6}, re-encode differs {:>5} ({:.2}%) e.g. {:?}",
            encoding.name(),
            decodable,
            differs,
            100.0 * differs as f64 / decodable as f64,
            samples
        );
    }

    println!("\n== Single-byte: every decodable byte re-encodes exactly? ==");
    for encoding in [WINDOWS_874, WINDOWS_1250, WINDOWS_1251, WINDOWS_1252, WINDOWS_1253, WINDOWS_1254, WINDOWS_1255, WINDOWS_1256, WINDOWS_1257, WINDOWS_1258] {
        let mut undecodable = Vec::new();
        let mut differs = Vec::new();
        for byte in 0u8..=255 {
            match encoding.decode_without_bom_handling_and_without_replacement(&[byte]) {
                Some(text) => {
                    if reencode(encoding, &text).as_deref() != Some(&[byte][..]) {
                        differs.push(byte);
                    }
                }
                None => undecodable.push(byte),
            }
        }
        println!("{:<12} undecodable {:02X?} differs {:02X?}", encoding.name(), undecodable, differs);
    }
}
