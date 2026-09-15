# 여기에 녹음 파일을 넣습니다

`voiceover.wav` (또는 `voiceover.mp3` · `voiceover.m4a`) 하나면 됩니다.
대본(`video/narration.ko.json`) 여섯 장면을 **한 번에 이어서** 읽고,
장면과 장면 사이만 한두 호흡 쉬어 주세요.

```bash
npm run video:say      # 파일 길이를 재고, 장면 구간의 「출발점」을 찍어 줍니다
```

찍힌 숫자를 들어 보고 고쳐서 `video/config.beonemirae.json` 의
`voiceover.marks` 에 적으신 뒤

```bash
npm run video          # 음성 붙은 MP4
```

**다시 녹음하시면 `marks` 숫자만 고치면 됩니다.** 파일 자체는 git 에 올라가지
않습니다(.gitignore).
