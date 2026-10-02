import * as THREE from 'three/webgpu';
import { Inspector } from 'three/addons/inspector/Inspector.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Sculptor } from 'three/addons/misc/Sculptor.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createNoise3D } from 'simplex-noise';

let renderer, scene, camera, controls, sculptor, mesh;
let cursorGroup, cursorRing, cursorDot, cursorMaterial;
let releasedPointerId = null;
let finishCallback = null;

const _normal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _forward = new THREE.Vector3( 0, 0, 1 );
const _pointer = new THREE.Vector2();
const _mouse = new THREE.Vector3();
const _mouseOffset = new THREE.Vector3();
const cursorDotRadius = 2.5;

const link = document.createElement( 'a' );
link.style.display = 'none';
document.body.appendChild( link );

const audioCtx = new AudioContext();
const clayBuffers = [];
let lastSfxTime = 0;
const SFX_INTERVAL = 150; // ms entre sons durante o arraste

async function loadClaySfx( urls ) {

	for ( const url of urls ) {

		const response = await fetch( url );
		const data = await response.arrayBuffer();
		clayBuffers.push( await audioCtx.decodeAudioData( data ) );

	}

}

function playClay( volume = 0.4, force = false ) {

	if ( clayBuffers.length === 0 ) return;

	const now = performance.now();
	if ( force === false && now - lastSfxTime < SFX_INTERVAL ) return;
	lastSfxTime = now;

	const source = audioCtx.createBufferSource();
	source.buffer = clayBuffers[ Math.floor( Math.random() * clayBuffers.length ) ];
	source.playbackRate.value = 0.9 + Math.random() * 0.2;

	const gain = audioCtx.createGain();
	gain.gain.value = volume * ( 0.8 + Math.random() * 0.4 );

	source.connect( gain ).connect( audioCtx.destination );
	source.start();

}

loadClaySfx( [
	'/sfx/clay1.m4a',
	'/sfx/clay2.m4a',
	'/sfx/clay3.m4a',
] );

export function onSculptFinished( callback ) {

	finishCallback = callback;

}

function finishSculpt() {

	if ( sculptor.isSculpting() ) sculptor.endStroke();

	const geometry = sculptor.getGeometry();
	sculptor.disconnect();
	cursorGroup.visible = false;

	const blob = new THREE.Mesh( geometry, mesh.material );
	blob.quaternion.copy( mesh.quaternion );

	scene.remove( mesh );
	mesh.geometry.dispose();
	renderer.setAnimationLoop( null );

	if ( finishCallback ) finishCallback( blob );

}

// function exportGLTF() {

// 	const exporter = new GLTFExporter();
// 	const snapshot = mesh.clone();
// 	snapshot.geometry = sculptor.getGeometry();

// 	exporter.parse( snapshot, function ( buffer ) {

// 		const blob = new Blob( [ buffer ], { type: 'application/octet-stream' } );
// 		const objectURL = URL.createObjectURL( blob );
// 		link.href = objectURL;
// 		link.download = 'sculpt.glb';
// 		link.click();

// 		setTimeout( function () {

// 			URL.revokeObjectURL( objectURL );
// 			link.removeAttribute( 'href' );

// 		}, 0 );

// 	}, function ( error ) {

// 		console.error( error );

// 	}, { binary: true } );

// }

init();

function init() {

	// Renderer
	const canvas = document.getElementById('sculpt');
	renderer = new THREE.WebGPURenderer( { canvas, antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.inspector = new Inspector();

	// Scene

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x222222 );

	// Camera

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 100 );
	camera.position.set( 0, 0, 4 );

	// Lights

	scene.add( new THREE.AmbientLight( 0x404040 ) );

	const dirLight = new THREE.DirectionalLight( 0xffd4a8, 3.0 );
	dirLight.position.set( 1, 1.5, 2 );
	scene.add( dirLight );

	const dirLight2 = new THREE.DirectionalLight( 0x9aa9b5, 1.0 );
	dirLight2.position.set( - 1, - 0.5, - 1 );
	scene.add( dirLight2 );

	// Mesh
	const noise3D = createNoise3D();
	let geometry = new THREE.IcosahedronGeometry( 1, 75 );
	geometry.deleteAttribute('normal');
	geometry.deleteAttribute('uv');
	geometry = mergeVertices(geometry)

	const material = new THREE.MeshPhysicalMaterial( {
	color: 0x8a5a44,
	roughness: 0.75,
	metalness: 0,
	clearcoat: 0.3,
	clearcoatRoughness: 0.45,
	} );

	const position = geometry.attributes.position;
	const vector = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		vector.fromBufferAttribute(position, i);
		const noise = noise3D(vector.x * 1, vector.y * 1, vector.z * 1);
		vector.multiplyScalar(1 + noise * 0.15);
		vector.y *= 0.8;
		if (vector.y < -0.6) vector.y = -0.6;
		position.setXYZ(i, vector.x, vector.y, vector.z);
	}
	geometry.computeVertexNormals();
	mesh = new THREE.Mesh( geometry, material );
	scene.add( mesh );

	// Sculptor

	sculptor = new Sculptor( mesh, camera );
	sculptor.connect( renderer.domElement );

	sculptor.addEventListener( 'start', function () {

		releasedPointerId = null;
		controls.enabled = false;

		audioCtx.resume();
		playClay( 0.5, true);

	} );

	sculptor.addEventListener( 'change', function () {
		if ( sculptor.isSculpting() ) playClay( 0.3 );
	})

	sculptor.addEventListener( 'end', function () {

		controls.enabled = true;

	} );

	function handlePointerUp( event ) {

		// Ignore releases from other pointers during a stroke.
		if ( sculptor.isSculpting() ) return;

		releasedPointerId = event.pointerId;
		updateCursor( event );

	}

	function handlePointerCancel() {

		releasedPointerId = null;
		cursorGroup.visible = false;

	}

	function handleLostPointerCapture( event ) {

		// Keep the pointerup cursor; capture-loss coordinates are unreliable.
		if ( event.pointerId === releasedPointerId ) {

			releasedPointerId = null;
			return;

		}

		cursorGroup.visible = false;

	}

	renderer.domElement.addEventListener( 'pointerup', handlePointerUp );
	renderer.domElement.addEventListener( 'pointercancel', handlePointerCancel );
	renderer.domElement.addEventListener( 'lostpointercapture', handleLostPointerCapture );

	// Register OrbitControls after Sculptor so sculpt presses can disable orbiting.
	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.dampingFactor = 0.1;

	// Inspector

	const tools = {
		Clay: 'clay',
		Brush: 'brush',
		Inflate: 'inflate',
		Smooth: 'smooth',
		Flatten: 'flatten',
		Pinch: 'pinch',
		Crease: 'crease',
		Drag: 'drag',
		Scale: 'scale'
	};
	const params = {
		tool: sculptor.getTool(),
		size: sculptor.getSize(),
		strength: sculptor.getStrength(),
		detail: sculptor.getDetail(),
		negative: sculptor.getNegative()
	};
	const actions = { done: finishSculpt };
	const gui = renderer.inspector.createParameters( 'Sculptor' );

	gui.add( params, 'tool', tools ).onChange( function ( value ) {

		sculptor.setTool( value );
		params.size = sculptor.getSize();
		params.strength = sculptor.getStrength();
		params.negative = sculptor.getNegative();

	} );

	gui.add( params, 'size', 5, 200, 1 ).listen().onChange( function ( value ) {

		sculptor.setSize( value );

	} );

	gui.add( params, 'strength', 0, 1 ).listen().onChange( function ( value ) {

		sculptor.setStrength( value );

	} );

	gui.add( params, 'negative' ).listen().onChange( function ( value ) {

		sculptor.setNegative( value );

	} );

	gui.add( params, 'detail', 0, 1 ).onChange( function ( value ) {

		sculptor.setDetail( value );

	} );

	gui.add( mesh.material, 'wireframe' ).onChange( function () {

		mesh.material.needsUpdate = true;

	} );
	gui.add( actions, 'done' ).name( 'pronto!' );

	// Cursor

	cursorMaterial = new THREE.MeshBasicMaterial( {
		color: 0xcc0000,
		side: THREE.DoubleSide,
		depthTest: false,
		depthWrite: false
	} );

	cursorRing = new THREE.Mesh( new THREE.RingGeometry( 0.95, 1, 48 ), cursorMaterial );
	cursorDot = new THREE.Mesh( new THREE.CircleGeometry( 1, 16 ), cursorMaterial );

	cursorGroup = new THREE.Group();
	cursorGroup.add( cursorRing );
	cursorGroup.add( cursorDot );
	cursorGroup.visible = false;
	cursorGroup.renderOrder = 1;
	cursorRing.renderOrder = 1;
	cursorDot.renderOrder = 1;
	scene.add( cursorGroup );

	renderer.domElement.addEventListener( 'pointermove', updateCursor );
	renderer.domElement.addEventListener( 'pointerleave', function () {

		if ( sculptor.isSculpting() === false ) cursorGroup.visible = false;

	} );
	controls.addEventListener( 'change', function () {

		// Keep the cursor under the pointer while damping moves the camera.
		if ( cursorGroup.visible && sculptor.isSculpting() === false ) updateCursorPosition();

	} );

	function updateCursorScale( worldRadius ) {

		cursorGroup.scale.setScalar( worldRadius );
		cursorDot.scale.setScalar( cursorDotRadius / sculptor.getSize() );

	}

	function updateCursor( event ) {

		_pointer.set( event.clientX, event.clientY );

		// Hide the cursor while orbiting.
		if ( event.buttons > 0 && sculptor.isSculpting() === false ) {

			cursorGroup.visible = false;
			return;

		}

		updateCursorPosition();

	}

	function updateCursorPosition() {

		if ( sculptor.domElement === null ) {

			cursorGroup.visible = false;
			return;

		}

		const isHovering = sculptor.isSculpting() === false;
		if ( isHovering ) sculptor.pickFromPointer( _pointer.x, _pointer.y );

		const hasHit = sculptor.hasHit();

		if ( hasHit ) {

			mesh.updateWorldMatrix( true, false );

			sculptor.getHitPoint( cursorGroup.position ).applyMatrix4( mesh.matrixWorld );

			_normalMatrix.getNormalMatrix( mesh.matrixWorld );
			sculptor.getHitNormal( _normal ).applyNormalMatrix( _normalMatrix );
			cursorGroup.quaternion.setFromUnitVectors( _forward, _normal );

			updateCursorScale( sculptor.getWorldRadius() );

		} else {

			// Face the camera when the ray misses the mesh.
			const rect = renderer.domElement.getBoundingClientRect();
			const x = ( ( _pointer.x - rect.left ) / rect.width ) * 2 - 1;
			const offsetX = ( ( _pointer.x + sculptor.getSize() - rect.left ) / rect.width ) * 2 - 1;
			const y = - ( ( _pointer.y - rect.top ) / rect.height ) * 2 + 1;
			camera.updateWorldMatrix( true, false );
			_mouse.set( x, y, 0.5 ).unproject( camera );
			_mouseOffset.set( offsetX, y, 0.5 ).unproject( camera );

			cursorGroup.position.copy( _mouse );
			camera.getWorldQuaternion( cursorGroup.quaternion );
			updateCursorScale( _mouse.distanceTo( _mouseOffset ) );

		}

		cursorMaterial.color.setHex( hasHit && isHovering ? 0xcc0000 : 0xcc6600 );
		cursorRing.visible = isHovering;
		cursorDot.visible = true;
		cursorGroup.visible = true;

	}

	// Resize

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	controls.update();
	renderer.render( scene, camera );

}