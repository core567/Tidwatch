import {CanvasTexture,SRGBColorSpace} from 'three';
export function photovoltaicTexture(){const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d')!;ctx.fillStyle='#182e44';ctx.fillRect(0,0,1024,1024);
 for(let row=0;row<6;row++)for(let col=0;col<10;col++){const x=col*102.4+3,y=row*170.7+3;ctx.fillStyle=(row+col)%3?'#254258':'#2c495e';ctx.fillRect(x,y,96,164);ctx.strokeStyle='#9faeb7';ctx.lineWidth=1;for(let k=1;k<8;k++){ctx.beginPath();ctx.moveTo(x,y+k*20);ctx.lineTo(x+96,y+k*20);ctx.stroke()}ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+48,y);ctx.lineTo(x+48,y+164);ctx.stroke()}
 const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.anisotropy=4;return t}
