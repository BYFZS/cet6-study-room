# 内置词汇读音

词汇读音和例句用 [Piper](https://github.com/OHF-Voice/piper1-gpl) 离线合成。网站按需加载一条录音，安卓随包提供。听力专项和模拟考试使用原始录音。

- 美音：en_US-ljspeech-medium，LJ Speech 公共领域录音，说明见 en-US/MODEL_CARD.txt。
- 英音：en_GB-cori-high，LibriVox 公共领域录音，说明见 en-GB/MODEL_CARD.txt。

项目仅分发生成的音频，不分发推理引擎或模型。生成命令：

    python -m pip install piper-tts lameenc
    python -m piper.download_voices en_US-ljspeech-medium en_GB-cori-high
    python generate-pronunciations.py en_US-ljspeech-medium.onnx en-US
    python generate-pronunciations.py en_GB-cori-high.onnx en-GB
    python generate-pronunciations.py en_US-ljspeech-medium.onnx en-US --examples
    python generate-pronunciations.py en_GB-cori-high.onnx en-GB --examples
    python generate-pronunciations.py en_US-ljspeech-medium.onnx en-US --options
    python generate-pronunciations.py en_GB-cori-high.onnx en-GB --options
