<script lang="ts">
  import { File, Folder, Grid2X2, Leaf, Settings2, Zap } from 'lucide-svelte';
  import FeatureRequestDialog from '#lib/components/FeatureRequestDialog.svelte';
</script>

<section class="hero-scene relative -mt-[68px] overflow-hidden pt-[68px]" aria-labelledby="home-hero-title">
  <div class="hero-art pointer-events-none absolute inset-0" aria-hidden="true">
    <div class="orbital-halo orbital-halo-left"></div>
    <div class="orbital-halo orbital-halo-right"></div>
    <div class="dot-field dot-field-left"></div>
    <div class="dot-field dot-field-right"></div>

    <svg class="orbit-trails" viewBox="0 0 1180 760" preserveAspectRatio="none" fill="none">
      <path d="M-130 485 C80 360 254 360 358 575" stroke="#72AAFF" stroke-opacity=".36" />
      <path d="M790 575 C850 376 1075 350 1300 485" stroke="#72AAFF" stroke-opacity=".36" />
      <path d="M-30 350 C64 70 290 85 385 262" stroke="white" stroke-opacity=".60" />
      <path d="M795 262 C920 55 1130 87 1210 350" stroke="white" stroke-opacity=".60" />
      <circle cx="125" cy="403" r="5.5" fill="#92BEFF" />
      <circle cx="305" cy="482" r="4" fill="#86B8FF" />
      <circle cx="358" cy="575" r="5" fill="#A9CDFF" />
      <circle cx="865" cy="420" r="5" fill="white" />
      <circle cx="1013" cy="400" r="5.5" fill="#92BEFF" />
      <circle cx="805" cy="260" r="6" fill="#8DBAFF" />
      <circle cx="385" cy="262" r="3.5" fill="#B2D0FC" />
    </svg>

    <div class="float-card card-file">
      <span class="card-icon icon-file"><File size={25} strokeWidth={1.8} /></span>
      <span class="card-details">
        <span class="card-title">File tools</span>
        <span class="card-description">Convert, rename, organize<br />in seconds.</span>
      </span>
      <span class="card-more">···</span>
    </div>

    <div class="float-card card-focus">
      <span class="card-icon icon-focus"><Leaf size={25} strokeWidth={1.9} /></span>
      <span class="card-details">
        <span class="card-title">Focus utilities</span>
        <span class="card-description">Simple tools for<br />a calmer day.</span>
      </span>
      <span class="card-more">···</span>
    </div>

    <div class="float-card card-everyday">
      <span class="card-icon icon-everyday"><Zap size={26} strokeWidth={1.9} fill="currentColor" /></span>
      <span class="card-details">
        <span class="card-title">Everyday tools</span>
        <span class="card-description">Do more with less<br />friction.</span>
      </span>
      <span class="card-more">···</span>
    </div>

    <div class="float-card card-source">
      <span class="card-icon icon-source"><Settings2 size={26} strokeWidth={1.9} /></span>
      <span class="card-details">
        <span class="card-title">Open source</span>
        <span class="card-description">Built with care,<br />for everyone.</span>
      </span>
      <span class="card-more">···</span>
    </div>

    <span class="floating-chip chip-folder"><Folder size={25} strokeWidth={1.8} fill="#2384F8" /></span>
    <span class="floating-chip chip-grid"><Grid2X2 size={24} strokeWidth={2.3} /></span>
  </div>

  <div class="hero-content relative z-10 mx-auto flex w-full max-w-[600px] flex-col items-center justify-center px-4 text-center">
    <h1 id="home-hero-title" class="m-0 text-display font-semibold tracking-[-0.055em]">
      Useful tools.<br />Nothing extra.
    </h1>
    <p class="mx-auto mt-5 max-w-[540px] text-body font-normal tracking-[-0.01em] text-muted-foreground">
      Small utilities for files, focus, and everyday work — designed to get out of the way.
    </p>
    <div class="mt-6 flex justify-center">
      <FeatureRequestDialog />
    </div>
  </div>

  <div class="hero-wave pointer-events-none absolute" aria-hidden="true"></div>

  <a class="scroll-cue absolute z-20 flex flex-col items-center gap-3 text-meta text-[#8293B3] transition-colors hover:text-primary" href="#tools" aria-label="Scroll to explore tools">
    <span class="scroll-icon" aria-hidden="true"><span></span></span>
    <span class="tracking-[0.09em]">SCROLL TO EXPLORE</span>
  </a>
</section>

<style>
  .hero-scene {
    isolation: isolate;
    min-height: clamp(650px, 88svh, 810px);
    background:
      radial-gradient(ellipse 31% 34% at 20% 33%, rgb(101 162 255 / 0.24), transparent 95%),
      radial-gradient(ellipse 29% 37% at 86% 41%, rgb(92 159 255 / 0.27), transparent 95%),
      radial-gradient(ellipse 34% 28% at 21% 75%, rgb(86 153 249 / 0.15), transparent 96%),
      radial-gradient(ellipse 28% 27% at 79% 78%, rgb(93 162 252 / 0.18), transparent 96%),
      linear-gradient(180deg, #c9defc 0%, #e4efff 21%, #f5f9ff 54%, #fcfcf8 100%);
  }

  .hero-scene::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: radial-gradient(ellipse 31% 52% at 50% 49%, rgb(255 255 255 / 0.92) 0%, rgb(255 255 255 / 0.56) 56%, transparent 100%);
  }

  .hero-art {
    left: 50%;
    width: min(100%, 1450px);
    transform: translateX(-50%);
    z-index: 1;
  }

  .orbital-halo {
    position: absolute;
    width: 40%;
    aspect-ratio: 1;
    border: 1px solid rgb(255 255 255 / 0.48);
    border-radius: 50%;
    top: 16%;
  }
  .orbital-halo-left { left: -7%; top: 12%; width: 43%; }
  .orbital-halo-right { right: -5%; top: 20%; width: 38%; }

  .dot-field {
    position: absolute;
    top: 19%;
    width: 32%;
    height: 65%;
    opacity: .55;
    background-image: radial-gradient(#8cbbff 0.8px, transparent 0.8px);
    background-size: 15px 15px;
    mask-image: radial-gradient(ellipse at center, black 12%, transparent 74%);
  }
  .dot-field-left { left: 18%; }
  .dot-field-right { right: 18%; }

  .orbit-trails {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .float-card {
    position: absolute;
    display: flex;
    align-items: center;
    width: 232px;
    min-height: 88px;
    padding: 12px;
    gap: 8px;
    border: 1px solid rgb(255 255 255 / 0.88);
    border-radius: 16px;
    background: linear-gradient(145deg, rgb(255 255 255 / 0.77), rgb(255 255 255 / 0.51));
    box-shadow: 0 16px 45px rgb(59 110 192 / 0.085), 0 2px 8px rgb(255 255 255 / 0.50);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    transform: rotate(var(--tilt));
    animation: hero-card-drift var(--drift-duration, 7s) ease-in-out var(--drift-delay, 0s) infinite alternate;
    will-change: transform;
  }

  /* Organic layout: deliberately uneven distances, angles, and rhythm. */
  .card-file {
    left: 7%;
    top: 23%;
    --tilt: -9deg;
    --drift-duration: 6.4s;
    --drift-delay: -1.2s;
  }
  .card-focus {
    left: 3%;
    top: 68%;
    --tilt: 5deg;
    --drift-duration: 7.8s;
    --drift-delay: -3.4s;
  }
  .card-everyday {
    right: 6%;
    top: 27%;
    --tilt: 8deg;
    --drift-duration: 8.2s;
    --drift-delay: -4.1s;
  }
  .card-source {
    right: 4%;
    top: 71%;
    --tilt: -6deg;
    --drift-duration: 7.1s;
    --drift-delay: -2.5s;
  }

  @keyframes hero-card-drift {
    from { transform: translate3d(0, -4px, 0) rotate(var(--tilt)); }
    to { transform: translate3d(0, 6px, 0) rotate(var(--tilt)); }
  }

  .card-icon {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 12px;
  }
  .icon-file { color: #2384f8; background: #e1efff; }
  .icon-focus { color: #19b879; background: #dff8ed; }
  .icon-everyday { color: #7861f2; background: #eae7ff; }
  .icon-source { color: #7186a3; background: #e1e9f4; }

  .card-details {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }
  .card-title {
    color: #16213b;
    font-size: var(--text-ui);
    line-height: var(--text-ui--line-height);
    font-weight: 600;
    white-space: nowrap;
  }
  .card-description {
    color: #7a8aa9;
    font-size: var(--text-meta);
    line-height: var(--text-meta--line-height);
    font-weight: 400;
  }
  .card-more {
    position: absolute;
    top: 8px;
    right: 12px;
    color: #9baed0;
    font-size: 18px;
    letter-spacing: 1px;
  }
  .floating-chip {
    position: absolute;
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.82);
    border-radius: 20px;
    background: rgb(255 255 255 / 0.72);
    box-shadow: 0 12px 30px rgb(79 136 211 / 0.10);
    backdrop-filter: blur(15px);
  }
  .chip-folder {
    left: 28%;
    top: 65%;
    color: #2585f9;
    --tilt: 16deg;
    --drift-duration: 7.4s;
    --drift-delay: -2s;
  }
  .chip-grid {
    right: 27%;
    top: 54%;
    color: #2585f9;
    --tilt: -13deg;
    --drift-duration: 6.8s;
    --drift-delay: -3s;
  }
  .floating-chip {
    transform: rotate(var(--tilt));
    animation: hero-card-drift var(--drift-duration) ease-in-out var(--drift-delay) infinite alternate;
    will-change: transform;
  }

  .hero-content {
    min-height: calc(clamp(650px, 88svh, 810px) - 68px);
    padding-top: 58px;
    padding-bottom: 136px;
  }
  .hero-content h1 { color: #101b3a; }
  .hero-content p { color: #71809d; }

  .hero-wave {
    z-index: 2;
    left: 50%;
    bottom: -153px;
    width: 150%;
    height: 260px;
    transform: translateX(-50%);
    border-radius: 50% 50% 0 0 / 75% 75% 0 0;
    background: linear-gradient(180deg, rgb(250 252 255 / 0.82), var(--background) 69%);
    border-top: 1px solid rgb(255 255 255 / 0.89);
  }
  .scroll-cue {
    bottom: 46px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    text-decoration: none;
  }
  .scroll-icon {
    position: relative;
    display: block;
    width: 22px;
    height: 36px;
    border: 1.5px solid #aabddd;
    border-radius: 999px;
  }
  .scroll-icon span {
    position: absolute;
    width: 4px;
    height: 4px;
    top: 8px;
    left: 8px;
    border-radius: 50%;
    background: #8eabdc;
  }

  @media (max-width: 1100px) {
    .float-card { width: 216px; min-height: 80px; padding: 12px; gap: 8px; }
    .card-icon { width: 40px; height: 40px; }
    .card-file { left: 3%; }
    .card-focus { left: 1%; }
    .card-everyday { right: 3%; }
    .card-source { right: 1%; }
    .chip-folder { left: 26%; }
    .chip-grid { right: 25%; }
  }

  @media (max-width: 900px) {
    .float-card, .floating-chip { display: none; }
    .dot-field { width: 55%; opacity: .32; }
    .dot-field-left { left: -18%; }
    .dot-field-right { right: -18%; }
    .orbital-halo { top: 29%; width: 62%; }
    .orbital-halo-left { left: -36%; }
    .orbital-halo-right { right: -36%; }
    .orbit-trails { opacity: .5; }
  }

  @media (max-width: 700px) {
    .hero-scene {
      min-height: 580px;
      background:
        radial-gradient(ellipse 65% 35% at 10% 32%, rgb(101 162 255 / 0.19), transparent 95%),
        radial-gradient(ellipse 65% 40% at 90% 56%, rgb(92 159 255 / 0.16), transparent 95%),
        linear-gradient(180deg, #d5e5ff 0%, #eff6ff 38%, var(--background) 100%);
    }
    .hero-content { min-height: 512px; padding: 34px 12px 120px; }
    .hero-wave { height: 165px; bottom: -104px; width: 170%; }
    .scroll-cue { bottom: 34px; }
    .orbit-trails { opacity: .25; }
  }

  @media (prefers-reduced-motion: reduce) {
    .float-card, .floating-chip { animation: none; will-change: auto; }
    .scroll-cue { transition: none; }
  }
</style>
