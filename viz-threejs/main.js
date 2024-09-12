import * as THREE from './js/three.module.js';
import { GLTFLoader } from './js/GLTFLoader.js';
import { OrbitControls } from './js/OrbitControls.js';

const default_glb_path = './assets/mark_mid_v5.glb';
const default_anim_path = './assets/animation_frames.csv';
const default_audio_path = './assets/out.wav';

// 设置场景、相机和渲染器
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);  // 设置浅灰色背景

const camera_init_pos = new THREE.Vector3(0, 1.5, 1);
const camera_init_lookat = new THREE.Vector3(0, 1.5, 0);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// renderer.setAnimationLoop( animate );

camera.position.set(camera_init_pos.x, camera_init_pos.y, camera_init_pos.z);  // 设置相机位置，使其适应模型

document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target = camera_init_lookat;
controls.update()

// 添加光源
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6); // 环境光，强度0.6
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1); // 方向光，强度1
directionalLight.position.set(5, 10, 7.5); // 设置光源位置
directionalLight.castShadow = true;  // 启用阴影
scene.add(directionalLight);

// 可以添加辅助点光源，让模型看起来更加立体
const pointLight = new THREE.PointLight(0xFFFFFF, 1, 100); // 点光源，强度1
pointLight.position.set(5, 5, 5); // 设置光源位置
scene.add(pointLight);

// 添加地板以模拟反射或让场景有一个基础
const floorGeometry = new THREE.PlaneGeometry(500, 500);
const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });  // 地板材质有阴影效果
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1;
floor.receiveShadow = true;  // 地板接收阴影
scene.add(floor);

renderer.shadowMap.enabled = true;  // 启用阴影

let faceMesh, bottomDentureMesh, tongueMesh;
let animationData = [];
let currentFrame = 0;
let isRunning = false;
let glbLoaded = false;
let csvLoaded = false;
let lastFrameTime = 0;  // 上一帧的时间戳
let frameDurations = []; // 每帧的持续时间数组

// Function to clear the scene
function clearScene() {
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }
    // Re-add essential elements
    scene.add(ambientLight);
    scene.add(directionalLight);
    scene.add(pointLight);
    scene.add(floor);
}

// 加载GLB文件的函数，可以处理文件或路径
function loadGLB(input) {
    clearScene();
    const loader = new GLTFLoader();
    const loadPath = input instanceof File ? URL.createObjectURL(input) : input;

    console.log("GLB loadPath:", loadPath)
    
    loader.load(loadPath, function (gltf) {
        const model = gltf.scene;
        model.traverse(function (node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        scene.add(gltf.scene);

        const meshes = [
            gltf.scene.getObjectByName('c_headWatertight_mid'),
            // gltf.scene.getObjectByName('c_bottomDenture_mid'),
            // gltf.scene.getObjectByName('c_tongue_mid')
        ];

        meshes.forEach(mesh => {
            if (mesh) {
                // 创建新的 MeshPhongMaterial
                const material = new THREE.MeshPhongMaterial({
                    color: mesh.material.color,
                    shininess: 30,
                    specular: 0x444444,
                    flatShading: false
                });
                
                // 应用新材质
                mesh.material = material;
                
                // 重新计算法线以获得更平滑的外观
                mesh.geometry.computeVertexNormals();
            }
        });

        faceMesh = gltf.scene.getObjectByName('c_headWatertight_mid');
        bottomDentureMesh = gltf.scene.getObjectByName('c_bottomDenture_mid');
        tongueMesh = gltf.scene.getObjectByName('c_tongue_mid');
        
        if (faceMesh && bottomDentureMesh && tongueMesh) {
            console.log('Meshes loaded successfully');
        } else {
            console.error('Failed to load one or more meshes');
        }

        console.log('Face mesh position:', faceMesh.position);
        console.log('Face mesh morph targets:', faceMesh.morphTargetDictionary);
        console.log('Bottom denture mesh morph targets:', bottomDentureMesh.morphTargetDictionary);
        console.log('Tongue mesh morph targets:', tongueMesh.morphTargetDictionary);

        camera.position.set(camera_init_pos.x, camera_init_pos.y, camera_init_pos.z);
        controls.target = camera_init_lookat;

        // console.log('Camera position:', camera.position);
        // console.log('Camera:', camera);

        controls.update();
        glbLoaded = true;

        if (input instanceof File) {
            URL.revokeObjectURL(loadPath);
        }
    }, undefined, function (error) {
        console.error('An error occurred while loading the GLB:', error);
    });
}

// Function to load CSV data from either a file or a path
function loadCSV(input) {
    const processCSV = (csvContent) => {
        const lines = csvContent.split('\n');
        
        // Parse headers
        const headers = lines[0].split(',').map(header => header.trim().replace(/^blendShapes\./, '').replace(/^[A-Z]/, match => match.toLowerCase()));
        headers[0] = 'frameCount';
        console.log('csv headers:', headers);

        // Parse data
        animationData = lines.slice(1)
            .filter(line => line.trim() !== '')
            .map(line => {
                const values = line.split(',').map(value => value.trim());
                if (values.length !== headers.length) {
                    console.warn(`Skipping incomplete line: ${line}`);
                    return null;
                }
                return Object.fromEntries(headers.map((header, index) => {
                    const parsedValue = parseFloat(values[index]);
                    return [header, isNaN(parsedValue) ? values[index] : parsedValue];
                }));
            })
            .filter(frameData => frameData !== null);

        console.log(`Parsed ${animationData.length} valid frames`);

        // Calculate frame durations
        frameDurations = animationData.slice(1).map((frameData, i) => (frameData['timeCode'] - animationData[i]['timeCode']) * 1000);
        frameDurations.push(frameDurations[frameDurations.length - 1]);

        csvLoaded = true;
        console.log('CSV loaded and parsed successfully');
        console.log('animationData length:', animationData.length);
        console.log('frameDurations length:', frameDurations.length);
        console.log('animationData[:10]:', animationData.slice(0, 10));
        console.log('frameDurations[:10]:', frameDurations.slice(0, 10));
    };

    if (input instanceof File) {
        const reader = new FileReader();
        reader.onload = (event) => processCSV(event.target.result);
        reader.readAsText(input);
    } else {
        fetch(input)
            .then(response => response.text())
            .then(processCSV)
            .catch(error => console.error('An error occurred while loading the CSV:', error));
    }
}

// 更新人脸动画
function updateFaceAnimation(frame) {
    if (faceMesh && bottomDentureMesh && tongueMesh && animationData.length > 0) {
        const blendShapes = animationData[frame];
        
        // console.log('Updating face animation with frame:', frame);
        // console.info('Blend shapes:', blendShapes);
        // console.info('Face mesh morph targets:', faceMesh.morphTargetDictionary);
        // console.info('Bottom denture mesh morph targets:', bottomDentureMesh.morphTargetDictionary);
        // console.info('Tongue mesh morph targets:', tongueMesh.morphTargetDictionary);
        
        for (const [key, value] of Object.entries(blendShapes)) {
            if (faceMesh.morphTargetInfluences) {
                const blendShapeIndex = faceMesh.morphTargetDictionary[key];
                if (blendShapeIndex !== undefined) {
                    faceMesh.morphTargetInfluences[blendShapeIndex] = value;
                }
                // else {
                //     console.warn(`Blend shape "${key}" not found in face mesh.`);
                // }
            }
            if (bottomDentureMesh.morphTargetInfluences) {
                const blendShapeIndex = bottomDentureMesh.morphTargetDictionary[key];
                if (blendShapeIndex !== undefined) {
                    bottomDentureMesh.morphTargetInfluences[blendShapeIndex] = value;
                }
            }
            if (tongueMesh.morphTargetInfluences) {
                const blendShapeIndex = tongueMesh.morphTargetDictionary[key];
                if (blendShapeIndex !== undefined) {
                    tongueMesh.morphTargetInfluences[blendShapeIndex] = value;
                }
            }
        }
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    const now = Date.now();
    const deltaTime = now - lastFrameTime;

    if (isRunning && animationData.length > 0) {
        // Play audio when animation is running
        if (audioPlayer.paused) {
            audioPlayer.play();
        }

        if (deltaTime >= frameDurations[currentFrame]) {
            updateFaceAnimation(currentFrame);
            currentFrame++;
            
            // Check if the animation has reached the end
            if (currentFrame >= animationData.length) {
                currentFrame = 0;
                audioPlayer.currentTime = 0;

                if (!document.getElementById('loopCheckbox').checked) {
                    // If loop is not checked, stop the animation
                    isRunning = false;
                    audioPlayer.pause();
                }
            }
            
            lastFrameTime = now;
        }
    } else {
        // Pause audio when animation is not running
        audioPlayer.pause();
    }

    renderer.render(scene, camera);
}


// 处理GLB文件上传
document.getElementById('glbInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        loadGLB(file);
    }
});

// 处理CSV文件上传
document.getElementById('csvInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        loadCSV(file);
    }
});

// Add the following code at the end of the file
document.getElementById('audioInput').addEventListener('change', function(e) {
    const audioPlayer = document.getElementById('audioPlayer');
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const fileURL = URL.createObjectURL(file);
        audioPlayer.src = fileURL;

        console.log('Audio file loaded:', fileURL);
        console.log('Audio player:', audioPlayer);
    } else {
        audioPlayer.src = default_audio_path;
        console.log('Using default audio file:', default_audio_path);
    }
});

// 添加事件监听器，当选择改变时加载新的GLB文件
document.getElementById('default3DAsset').addEventListener('change', (event) => {
    const selectedGlbPath = event.target.value;
    if (selectedGlbPath) {
        loadGLB(selectedGlbPath);
    }
});

function loadDefautAnimData() {
    // load default anim data
    loadCSV(default_anim_path);
    csvLoaded = true;

    console.log('Using default anim data:', default_anim_path);

    // load default audio file
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.src = default_audio_path;
    console.log('Using default audio file:', default_audio_path);
}
// 运行按钮点击事件
document.getElementById('loadDefautAnimData').addEventListener('click', () => {
    loadDefautAnimData();
});

// 运行按钮点击事件
document.getElementById('runButton').addEventListener('click', () => {
    if (glbLoaded && csvLoaded) {
        isRunning = !isRunning;
        if (isRunning) {
            lastFrameTime = Date.now();
            console.log('Animation started. isRunning:', isRunning);
        } else {
            console.log('Animation stopped. isRunning:', isRunning);
        }
    } else {
        console.warn('Please ensure both GLB and CSV files are loaded before running the animation');
    }
});

// 加载默认文件
window.onload = () => {
    const default3DAsset = document.getElementById('default3DAsset');
    const defaultGlbPath = default3DAsset.value || default_glb_path;
    
    loadGLB(defaultGlbPath);
    loadDefautAnimData();
};

// 在文件加完成后，添加以下日志
console.log('Animation data loaded:', animationData.length);
console.log('Frame durations:', frameDurations);

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

