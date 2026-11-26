import * as THREE from 'three';

// Ajustes visuales de la capa de puntos. Son los primeros valores a tocar
// si se necesita más/menos ruido, partículas más finas o más rendimiento.
export const POINT_CLOUD_CAMERA_FOV = 50;
export const POINT_CLOUD_CAMERA_SCALE = 0.72;
export const POINT_CLOUD_POINT_SIZE = 0.0028;
export const POINT_CLOUD_RENDER_FPS = 30;

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
    ) * 0.0008;
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
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.18, edge) * 0.92);
  }
`;

// Crea el material compartido por las máscaras M1 y M2.
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
