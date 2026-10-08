import * as THREE from 'three/webgpu';
import { Inspector } from 'three/addons/inspector/Inspector.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sculptor } from 'three/addons/misc/Sculptor.js';
import { createBlobGeometry } from './blob.js';
import { initAudio, unlockAudio, playClay } from '../audio/audio.js';
import { getCursorState } from './cursorState.js';

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


initAudio().catch( ( error ) => console.warn( '[audio]', error.message ) );
window.addEventListener( 'pointerdown', unlockAudio, { once: true } );

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

init();

function init() {


	const canvas = document.getElementById( 'sculpt' );
	renderer = new THREE.WebGPURenderer( { canvas, antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.inspector = new Inspector();


	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x222222 );


	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 100 );
	camera.position.set( 0, 0, 4 );


	scene.add( new THREE.AmbientLight( 0x404040 ) );

	const dirLight = new THREE.DirectionalLight( 0xffd4a8, 3.0 );
	dirLight.position.set( 1, 1.5, 2 );
	scene.add( dirLight );

	const dirLight2 = new THREE.DirectionalLight( 0x9aa9b5, 1.0 );
	dirLight2.position.set( - 1, - 0.5, - 1 );
	scene.add( dirLight2 );


	const material = new THREE.MeshPhysicalMaterial( {
		color: 0x8a5a44,
		roughness: 0.75,
		metalness: 0,
		clearcoat: 0.3,
		clearcoatRoughness: 0.45,
	} );

	mesh = new THREE.Mesh( createBlobGeometry(), material );
	scene.add( mesh );


	sculptor = new Sculptor( mesh, camera );
	sculptor.connect( renderer.domElement );

	sculptor.addEventListener( 'start', function () {

		releasedPointerId = null;
		controls.enabled = false;

		unlockAudio();
		playClay( 0.5, true );

	} );

	sculptor.addEventListener( 'change', function () {

		if ( sculptor.isSculpting() ) playClay( 0.3 );

	} );

	sculptor.addEventListener( 'end', function () {

		controls.enabled = true;

	} );

	function handlePointerUp( event ) {

		if ( sculptor.isSculpting() ) return;

		releasedPointerId = event.pointerId;
		updateCursor( event );

	}

	function handlePointerCancel() {

		releasedPointerId = null;
		cursorGroup.visible = false;

	}

	function handleLostPointerCapture( event ) {

		if ( event.pointerId === releasedPointerId ) {

			releasedPointerId = null;
			return;

		}

		cursorGroup.visible = false;

	}

	renderer.domElement.addEventListener( 'pointerup', handlePointerUp );
	renderer.domElement.addEventListener( 'pointercancel', handlePointerCancel );
	renderer.domElement.addEventListener( 'lostpointercapture', handleLostPointerCapture );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.dampingFactor = 0.1;


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

		const cursorState = getCursorState( { hasHit, isHovering } );
		cursorMaterial.color.setHex( cursorState.color );
		cursorRing.visible = cursorState.ringVisible;
		cursorDot.visible = true;
		cursorGroup.visible = true;

	}


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