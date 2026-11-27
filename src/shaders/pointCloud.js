import * as THREE from 'three';

// Ajustes visuales de la capa de puntos. Son los primeros valores a tocar
// si se necesita más/menos ruido, partículas más finas o más rendimiento.
export const POINT_CLOUD_CAMERA_FOV = 50;
export const POINT_CLOUD_CAMERA_SCALE = 0.72;
export const POINT_CLOUD_POINT_SIZE = 0.0056;
export const POINT_CLOUD_RENDER_FPS = 45;

// El ruido ocurre en la GPU: no movemos miles de vértices desde React.
const pointCloudVertexShader = `
  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uPointSize;
  varying vec3 vColor;

  void main() {
    vec3 noise = vec3(
      sin(uTime * 1.7 + position.y * 42.0 + position.z * 19.0),
      cos(uTime * 1.35 + position.x * 37.0 + position.z * 13.0),
      sin(uTime * 1.15 + position.x * 23.0 - position.y * 31.0)
    ) * 0.008;
    vec4 mvPosition = modelViewMatrix * vec4(position + noise, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointSize * uViewportHeight / (-mvPosition.z * 2.0 * tan(radians(50.0) * 0.5));
    vColor = color;
  }
`;

const pointCloudFragmentShader = `
  varying vec3 vColor;

  void main() {
    float edge = distance(gl_PointCoord, vec2(0.5));
    if (edge > 0.5) discard;
    float core = smoothstep(0.5, 0.16, edge);
    float halo = smoothstep(0.5, 0.02, edge);
    vec3 emissiveColor = min(vColor * 2.4 + vec3(0.2, 0.16, 0.06), vec3(1.0));
    gl_FragColor = vec4(emissiveColor, mix(core, halo, 0.5));
  }
`;

// Crea el material de la ventana de hover.
export function createPointCloudMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uViewportHeight: { value: 1 },
      uPointSize: { value: POINT_CLOUD_POINT_SIZE },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    vertexShader: pointCloudVertexShader,
    fragmentShader: pointCloudFragmentShader,
  });
}
