// A continuous belt. Clones are decorative; the original set remains keyboard accessible.
export function mountCarousel(root,{speed=24}={}){
  const viewport=root.querySelector('.runway-viewport'),track=root.querySelector('.runway-track');
  const originals=[...track.children];const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const before=document.createElement('div'),after=document.createElement('div');
  function copies(target){target.className='runway-group';for(const card of originals){const clone=card.cloneNode(true);clone.setAttribute('aria-hidden','true');clone.querySelectorAll('button').forEach(b=>{b.tabIndex=-1;});target.append(clone);}}
  const group=document.createElement('div');group.className='runway-group';originals.forEach(c=>group.append(c));copies(before);copies(after);track.replaceChildren(before,group,after);
  let remainder=0,width=0,frame=0,last=0,stopped=false,userPaused=reduce.matches,interacting=false,held=false;
  const pause=root.querySelector('[data-carousel="pause"]');
  function label(){pause.textContent=userPaused?'Reanudar':'Pausar';pause.setAttribute('aria-pressed',String(userPaused));}
  function measure(){width=group.getBoundingClientRect().width;viewport.scrollLeft=width;}
  const observer=new ResizeObserver(measure);observer.observe(group);
  function tick(now){if(stopped)return;if(width&&!userPaused&&!interacting&&!held&&!document.hidden){remainder+=speed*Math.min((now-last)/1000,.05);const pixels=Math.floor(remainder);remainder-=pixels;viewport.scrollLeft+=pixels;if(viewport.scrollLeft>=width*2)viewport.scrollLeft-=width;if(viewport.scrollLeft<width*.25)viewport.scrollLeft+=width;}last=now;frame=requestAnimationFrame(tick);}
  const listeners=[];function on(el,event,fn){el.addEventListener(event,fn);listeners.push(()=>el.removeEventListener(event,fn));}
  on(root,'click',e=>{const action=e.target.closest('[data-carousel]')?.dataset.carousel;if(!action)return;
    if(action==='pause'){userPaused=!userPaused;label();}
    else{userPaused=true;label();const step=group.firstElementChild.getBoundingClientRect().width+20;let dest=viewport.scrollLeft+(action==='next'?step:-step);if(dest<width*.25){viewport.scrollLeft+=width;dest+=width;}if(dest>=width*2){viewport.scrollLeft-=width;dest-=width;}viewport.scrollTo({left:dest,behavior:reduce.matches?'instant':'smooth'});}
  });
  on(viewport,'pointerenter',()=>{interacting=true;});on(viewport,'pointerleave',()=>{interacting=false;});
  on(viewport,'touchstart',()=>{userPaused=true;label();});
  on(viewport,'focusin',()=>{interacting=true;userPaused=true;label();});on(viewport,'focusout',()=>{interacting=false;});
  on(reduce,'change',()=>{userPaused=reduce.matches;label();});
  label();measure();frame=requestAnimationFrame(tick);
  return {hold(value){held=value;},destroy(){stopped=true;cancelAnimationFrame(frame);observer.disconnect();listeners.forEach(fn=>fn());}};
}
