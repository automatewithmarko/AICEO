// src/components/stagedemo/blobShader.js

// Simplex 3D noise (Ashima Arts — public domain)
const simplexNoise = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const vertexShader = `
${simplexNoise}

uniform float uTime;
uniform float uAudioLevel;     // 0-1 overall audio energy
uniform float uBassLevel;      // 0-1 low freq energy
uniform float uDisplacement;   // base displacement scale (0.3 idle, up to 1.0 active)

varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Multi-octave noise for organic feel
  float noise1 = snoise(position * 1.5 + uTime * 0.3) * 0.6;
  float noise2 = snoise(position * 3.0 + uTime * 0.5) * 0.3;
  float noise3 = snoise(position * 6.0 + uTime * 0.8) * 0.1;
  float noise = noise1 + noise2 + noise3;

  // Audio-reactive displacement
  float audioMod = 0.2 + 0.8 * uAudioLevel;
  float bassMod = 1.0 + uBassLevel * 0.5;
  float displacement = noise * uDisplacement * audioMod * bassMod;

  vec3 newPosition = position + normal * displacement;
  vDisplacement = displacement;
  vNormal = normalMatrix * normal;
  vPosition = (modelViewMatrix * vec4(newPosition, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

export const fragmentShader = `
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uTime;

varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Fresnel effect for edge glow
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.5);

  // Base color: dark red core
  vec3 coreColor = vec3(0.15, 0.02, 0.02);

  // Displacement-driven color (red → pink → purple)
  vec3 midColor = vec3(0.6, 0.1, 0.15);
  vec3 hotColor = vec3(0.7, 0.15, 0.5);
  vec3 purpleColor = vec3(0.4, 0.1, 0.7);

  float d = clamp(vDisplacement * 2.0 + 0.5, 0.0, 1.0);
  vec3 displaceColor = mix(midColor, hotColor, d);
  displaceColor = mix(displaceColor, purpleColor, uBassLevel * 0.6);

  // Combine core + displacement + fresnel
  vec3 color = mix(coreColor, displaceColor, d * 0.7);
  color += fresnel * vec3(0.8, 0.2, 0.3) * (0.3 + 0.7 * uAudioLevel);

  // Subtle pulsing glow
  float pulse = sin(uTime * 2.0) * 0.05 + 0.95;
  color *= pulse;

  // Alpha: solid core, slight transparency at edges
  float alpha = mix(0.95, 0.6, fresnel * 0.5);

  gl_FragColor = vec4(color, alpha);
}
`;
