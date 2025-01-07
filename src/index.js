import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { MathUtils, Quaternion, Euler, KeyframeTrack, AnimationClip, AnimationMixer } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

gsap.registerPlugin(ScrollTrigger);

const CAMERA_CONFIG = {
	FOV: 1,
	NEAR: 0.3,
	FAR: 1000,
	INITIAL_POSITION: [1, 1, 10]
};

const ANIMATION = {
	DURATION: 6,
	KEYFRAMES: {
		times: [0, 1, 6],
		positions: [
			[1, 0.95, 4],
			[1, 1, 0],
			[1, 1, -6]
		],
		rotations: [
			[-25, 25, 25],
			[0, 0, 0],
			[0, 0, 0]
		]
	}
};

class AnimationUtils {
	static eulerToQuaternion(x = 0, y = 0, z = 0) {
		const xRad = MathUtils.degToRad(x);
		const yRad = MathUtils.degToRad(y);
		const zRad = MathUtils.degToRad(z);
		const euler = new Euler(xRad, yRad, zRad, 'XYZ');
		const quaternion = new Quaternion();
		return quaternion.setFromEuler(euler);
	}
}

class Renderer {
	constructor() {
		this.renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.setupRenderer();
	}

	setupRenderer() {
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		this.renderer.physicallyCorrectLights = true;
		this.updateSize();
	}

	updateSize() {
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	get domElement() {
		return this.renderer.domElement;
	}
}

class Scene {
	constructor() {
		this.scene = new THREE.Scene();
		this.setupLights();
	}

	setupLights() {
		const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
		directionalLight.position.set(2, 2, 12);

		const ambientLight = new THREE.AmbientLight(0xffffff, 1);

		this.scene.add(directionalLight, ambientLight);
	}
}

class Camera {
	constructor() {
		this.camera = new THREE.PerspectiveCamera(
			CAMERA_CONFIG.FOV,
			window.innerWidth / window.innerHeight,
			CAMERA_CONFIG.NEAR,
			CAMERA_CONFIG.FAR
		);
		this.setupCamera();
	}

	setupCamera() {
		const [x, y, z] = CAMERA_CONFIG.INITIAL_POSITION;
		this.camera.position.set(x, y, z);
	}

	updateAspect() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
	}
}

class PhoneModel {
	constructor(scene) {
		this.scene = scene;
		this.loader = new GLTFLoader();
		this.mixer = null;
	}

	async load() {
		return new Promise((resolve, reject) => {
			this.loader.load(
				'/phone-anim/assets/model/iphone.glb',
				(gltf) => {
					this.model = gltf.scene;
					this.setupScreen();
					this.scene.add(this.model);
					this.setupAnimation();
					resolve();
				},
				(xhr) => console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`),
				reject
			);
		});
	}

	setupScreen() {
		const screen = this.model.getObjectByName('model_low018');
		if (!screen) return;

		const video = this.createVideo();
		const videoTexture = new THREE.VideoTexture(video);
		videoTexture.flipY = false;

		screen.material.map = videoTexture;
		screen.material.needsUpdate = true;
		screen.material.color = new THREE.Color(0xffffff);
		screen.material.side = THREE.FrontSide;
	}

	createVideo() {
		const video = document.createElement('video');
		 video.src = '/phone-anim/assets/video/00_Main.mp4';
		 video.loop = true;
		 video.autoplay = true;
		 video.muted = true;
		 video.playsInline = true;
		 video.play();
		 return video;
	}

	setupAnimation() {
		const { times, positions, rotations } = ANIMATION.KEYFRAMES;
		const quaternionValues = rotations.flatMap(([x, y, z]) => {
			const quaternion = AnimationUtils.eulerToQuaternion(x, y, z);
			return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
		});

		const tracks = [
			new KeyframeTrack('.position', times, positions.flat()),
			new KeyframeTrack('.quaternion', times, quaternionValues)
		];

		const clip = new AnimationClip('ModelMove', ANIMATION.DURATION, tracks);
		this.mixer = new AnimationMixer(this.model);
		const action = this.mixer.clipAction(clip);
		action.play();
		this.mixer.setTime(0);
	}

	updateAnimation(progress) {
		if (this.mixer) {
			const deltaTime = Math.min(progress, 0.99999) * ANIMATION.DURATION;
			this.mixer.setTime(deltaTime);
		}
	}
}

class Composer {
	constructor(renderer, scene, camera) {
		this.composer = new EffectComposer(renderer);
		this.setupPasses(scene, camera);
	}

	setupPasses(scene, camera) {
		const renderPass = new RenderPass(scene, camera);
		this.composer.addPass(renderPass);

		/*
		const bloomPass = new UnrealBloomPass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			1.5, 0.4, 0.85
		);
		bloomPass.threshold = 0;
		bloomPass.strength = 0.2;
		bloomPass.radius = 0.1;
		this.composer.addPass(bloomPass);
		*/
	}

	updateSize() {
		this.composer.setSize(window.innerWidth, window.innerHeight);
	}

	render() {
		this.composer.render();
	}
}

class App {
	constructor() {
		this.renderer = new Renderer();
		this.scene = new Scene();
		this.camera = new Camera();
		this.composer = new Composer(
			this.renderer.renderer,
			this.scene.scene,
			this.camera.camera
		);
		this.phone = new PhoneModel(this.scene.scene);

		document.body.appendChild(this.renderer.domElement);

		this.setupEventListeners();
		this.setupScrollTrigger();
		this.init();
	}

	async init() {
		await this.phone.load();
		this.animate();
	}

	setupEventListeners() {
		window.addEventListener('resize', () => {
			this.camera.updateAspect();
			this.renderer.updateSize();
			this.composer.updateSize();
		});
	}

	setupScrollTrigger() {
		ScrollTrigger.create({
			scrub: true,
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: (self) => this.phone.updateAnimation(self.progress)
		});
	}

	animate() {
		requestAnimationFrame(() => this.animate());
		this.composer.render();
	}
}

const app = new App();