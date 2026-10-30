import {useMemo} from 'react';
import {BackSide,Color,Vector3} from 'three';
import {useSceneSettings} from './sceneSettings';
export default function SkyDome(){
 const quality=useSceneSettings(s=>s.quality);
 const uniforms=useMemo(()=>({horizon:{value:new Color('#bad5e7')},zenith:{value:new Color('#5e97d0')},sun:{value:new Vector3(-36,33,34).normalize()},detail:{value:quality==='low'?0:1}}),[quality]);
 return <mesh name="daylight-sky" renderOrder={-100}><sphereGeometry args={[420,32,16]}/>
 <shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms}
 vertexShader={`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
 fragmentShader={`varying vec3 direction;uniform vec3 horizon,zenith,sun;uniform float detail;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){vec3 d=normalize(direction);vec3 col=mix(horizon,zenith,smoothstep(-.02,.35,d.y));
 float sunDot=max(dot(d,sun),0.);col+=vec3(1.,.65,.32)*pow(sunDot,32.)*.35+vec3(4.,2.9,1.7)*smoothstep(.9997,.99995,sunDot);
 if(detail>.5){vec2 p=d.xz/max(d.y+.25,.08);float cloud=noise(p*2.)*.55+noise(p*vec2(7.,16.))*.28+noise(p*29.)*.17;float c=smoothstep(.59,.77,cloud)*smoothstep(.01,.16,d.y);col=mix(col,vec3(.82,.85,.84),c*.5);}
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`}/></mesh>;
}
