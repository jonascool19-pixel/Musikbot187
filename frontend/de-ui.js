(() => {
  document.title = 'MusikBot187';
  const replacements = new Map([
    ['RADIOBOT','MUSIKBOT187'],['RadioBot','MusikBot187'],['Dashboard','Startseite'],['Queue','Warteschlange'],['Updates','Aktualisierungen'],['Skip','Überspringen'],['Stop','Stopp'],['Search','Suche'],['Files','Dateien'],['System','System']
  ]);
  function translate(root=document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[];
    let node;
    while((node=walker.nextNode())) nodes.push(node);
    for(const text of nodes){
      let value=text.nodeValue || '';
      for(const [from,to] of replacements) {
        if(value.trim()===from) value=to;
      }
      if(value!==text.nodeValue) text.nodeValue=value;
    }
    root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el=>{
      for(const attr of ['title','aria-label','placeholder']) if(el.hasAttribute(attr)) {
        const value=el.getAttribute(attr);
        const next=replacements.get(value) || value;
        if(next!==value) el.setAttribute(attr,next);
      }
    });
  }
  translate();
  new MutationObserver(() => translate()).observe(document.body,{childList:true,subtree:true});
})();
