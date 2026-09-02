"""Ephemeral, aggregate-only cover source diagnostics."""
from __future__ import annotations
import asyncio, ipaddress, socket, time
from collections import Counter
from statistics import median
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_CANDIDATES=4; MAX_REDIRECTS=3; MAX_IMAGE_BYTES=64*1024; MAX_PREFIX_BYTES=64
CREATOR_REFERER="https://creator.douyin.com/"; SAFE_USER_AGENT="XMT-Cover-Metadata/2.0"
IMAGE_ACCEPT="image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
IMAGE_MAGIC=(b"\x89PNG\r\n\x1a\n",b"\xff\xd8\xff",b"GIF87a",b"GIF89a",b"RIFF",b"\x00\x00\x00\x18ftyp",b"\x00\x00\x00\x1cftyp")
SOURCE_CLASSES=("DIRECT_PUBLIC","HEAD_UNSUPPORTED_GET_VALID","REFERER_BOUND","SESSION_BOUND","SIGNED_VALID","SIGNED_EXPIRING","SIGNED_EXPIRED","REMOTE_FORBIDDEN","INVALID_CONTENT","UNSAFE_REDIRECT","UNSAFE_NETWORK_TARGET","UNKNOWN")

def cover_candidates(work:dict[str,Any])->list[str]:
    video=work.get("video"); cover=work.get("cover") or work.get("cover_url") or (video.get("cover") if isinstance(video,dict) else None); result:list[str]=[]
    def visit(value:Any)->None:
        if len(result)>=MAX_CANDIDATES:return
        if isinstance(value,str):
            raw=value.strip(); parsed=urlparse(raw if not raw.startswith("//") else "https:"+raw)
            if parsed.scheme in {"http","https"} and parsed.netloc and parsed.username is None and parsed.password is None and parsed.geturl() not in result:result.append(parsed.geturl())
        elif isinstance(value,list):
            for item in value:visit(item)
        elif isinstance(value,dict):visit(value.get("url_list") or value.get("urlList") or value.get("url") or value.get("uri"))
    visit([cover]); return result

def public_host(host:str|None)->bool:
    if not host:return False
    try:
        addresses={entry[4][0] for entry in socket.getaddrinfo(host,None,type=socket.SOCK_STREAM)}
        return bool(addresses) and all(not(ipaddress.ip_address(a).is_private or ipaddress.ip_address(a).is_loopback or ipaddress.ip_address(a).is_link_local or ipaddress.ip_address(a).is_reserved or ipaddress.ip_address(a).is_multicast or ipaddress.ip_address(a).is_unspecified) for a in addresses)
    except OSError:return False

def ttl_seconds(url:str,now:float|None=None)->int|None:
    now=now or time.time()
    for key,values in parse_qs(urlparse(url).query).items():
        if key.lower() not in {"expire","expires","expiry","x-expires","x-expire"}:continue
        for value in values:
            try:
                stamp=float(value); stamp=stamp/1000 if stamp>100_000_000_000 else stamp
                if stamp>946_684_800:return int(stamp-now)
            except ValueError:pass
    return None

def url_shape(url:str)->dict[str,int]:
    parsed=urlparse(url); names={k.lower() for k in parse_qs(parsed.query,keep_blank_values=True)}; signed=any(k in {"signature","sign","sig","x-signature","x-amz-signature","auth_key"} or "signature" in k for k in names)
    return {"https":int(parsed.scheme=="https"),"query":int(bool(parsed.query)),"signed":int(signed),"expiry":int(ttl_seconds(url) is not None)}

class _RedirectGuard(HTTPRedirectHandler):
    def __init__(self,headers:dict[str,str])->None:super().__init__();self.count=0;self.headers=headers
    def redirect_request(self,req:Any,fp:Any,code:int,msg:str,headers:Any,target:str)->Any:
        self.count+=1; parsed=urlparse(target)
        if self.count>MAX_REDIRECTS or parsed.scheme not in {"http","https"} or parsed.username is not None or parsed.password is not None or not public_host(parsed.hostname):raise HTTPError(target,code,"unsafe_redirect",headers,fp)
        return Request(target,headers=self.headers,method=req.get_method())

def _headers(referer:bool,range_request:bool)->dict[str,str]:
    headers={"User-Agent":SAFE_USER_AGENT,"Accept":IMAGE_ACCEPT,"Accept-Encoding":"identity"}
    if range_request:headers["Range"]=f"bytes=0-{MAX_PREFIX_BYTES-1}"
    if referer:headers["Referer"]=CREATOR_REFERER
    return headers

def _request(url:str,method:str,referer:bool=False)->tuple[str,int]:
    parsed=urlparse(url)
    if parsed.scheme not in {"http","https"} or parsed.username is not None or parsed.password is not None or not public_host(parsed.hostname):return "UNSAFE_NETWORK_TARGET",0
    headers=_headers(referer,method=="GET")
    try:
        with build_opener(_RedirectGuard(headers)).open(Request(url,headers=headers,method=method),timeout=10) as response:
            if method=="HEAD":return "HEAD_OK",response.status
            length=int(response.headers.get("Content-Length","0") or 0)
            if length>MAX_IMAGE_BYTES:return "INVALID_CONTENT",response.status
            prefix=response.read(MAX_PREFIX_BYTES)
            return ("VALID" if response.headers.get_content_type().startswith("image/") and any(prefix.startswith(m) for m in IMAGE_MAGIC) else "INVALID_CONTENT"),response.status
    except HTTPError as error:
        if error.reason=="unsafe_redirect":return "UNSAFE_REDIRECT",error.code
        return ("FORBIDDEN" if error.code==403 else "NOT_FOUND" if error.code==404 else "UNKNOWN"),error.code
    except (URLError,TimeoutError,OSError):return "TIMEOUT",0

def probe_candidate(url:str)->dict[str,str|int]:
    """At most HEAD, no-ref Range GET, and one fixed-referer Range GET."""
    head,_=_request(url,"HEAD"); first,status=_request(url,"GET")
    if first=="VALID":return {"classification":"DIRECT_PUBLIC" if head=="HEAD_OK" else "HEAD_UNSUPPORTED_GET_VALID","head":head,"get":first,"referer":"SKIPPED","status":status}
    if first=="FORBIDDEN":
        referred,rstatus=_request(url,"GET",True)
        if referred=="VALID":return {"classification":"REFERER_BOUND","head":head,"get":first,"referer":referred,"status":rstatus}
        if referred in {"UNSAFE_REDIRECT","UNSAFE_NETWORK_TARGET"}:return {"classification":referred,"head":head,"get":first,"referer":referred,"status":rstatus}
        if referred=="FORBIDDEN":return {"classification":"REMOTE_FORBIDDEN","head":head,"get":first,"referer":referred,"status":rstatus}
    if first in {"UNSAFE_REDIRECT","UNSAFE_NETWORK_TARGET"}:return {"classification":first,"head":head,"get":first,"referer":"SKIPPED","status":status}
    if first=="INVALID_CONTENT":return {"classification":"INVALID_CONTENT","head":head,"get":first,"referer":"SKIPPED","status":status}
    return {"classification":"UNKNOWN","head":head,"get":first,"referer":"SKIPPED","status":status}

# Compatibility-only aggregate adapter for existing callers/tests.  It never
# exposes a URL and retains the old fixed outcome vocabulary.
def _probe(url:str)->str:
    classification=str(probe_candidate(url)["classification"])
    return "valid_images" if classification in {"DIRECT_PUBLIC","HEAD_UNSUPPORTED_GET_VALID","REFERER_BOUND"} else "forbidden" if classification in {"REMOTE_FORBIDDEN","UNSAFE_NETWORK_TARGET"} else "invalid_url" if classification in {"UNSAFE_REDIRECT","INVALID_CONTENT"} else "timeout"

async def summarize_covers(account_id:str,works:list[dict[str,Any]])->dict[str,Any]:
    seen:set[str]=set();with_candidates=0;ttl:list[int]=[];counts:Counter[str]=Counter();classes:Counter[str]=Counter();methods:Counter[str]=Counter();shapes:Counter[str]=Counter()
    for work in works:
        candidates=cover_candidates(work);with_candidates+=int(bool(candidates))
        for url in candidates:
            if url in seen:continue
            seen.add(url); shape=url_shape(url)
            for key,value in shape.items():shapes[key]+=value
            lifetime=ttl_seconds(url)
            if lifetime is not None:
                ttl.append(max(0,lifetime))
    semaphore=asyncio.Semaphore(2)
    async def guarded(url:str)->dict[str,str|int]:
        async with semaphore:return await asyncio.to_thread(probe_candidate,url)
    for result in await asyncio.gather(*(guarded(url) for url in seen)):
        classification=str(result["classification"]);classes[classification]+=1
        for key in ("head","get","referer"):methods[f"{key}_{str(result[key]).lower()}"]+=1
        if classification in {"DIRECT_PUBLIC","HEAD_UNSUPPORTED_GET_VALID","REFERER_BOUND"}:counts["valid_images"]+=1
        elif classification=="REMOTE_FORBIDDEN":counts["forbidden"]+=1
        elif int(result["status"])==404:counts["not_found"]+=1
        elif classification=="INVALID_CONTENT":counts["non_image"]+=1
        elif classification=="UNKNOWN":counts["timeout"]+=1
        elif classification in {"UNSAFE_REDIRECT","UNSAFE_NETWORK_TARGET"}:counts["invalid_url"]+=1
    expiring=sum(1 for value in ttl if 0<value<=3600); expired=sum(1 for value in ttl if value==0)
    summary={key:counts[key] for key in ("valid_images","forbidden","not_found","non_image","timeout","invalid_url")};summary.update({"signed":shapes["signed"],"expiring":expiring,"expired_at_collection":expired})
    result:dict[str,Any]={"works_seen":len(works),"works_with_candidates":with_candidates,"works_without_candidates":len(works)-with_candidates,"candidates_seen":len(seen),"probe_summary":summary,"source_classification":{key:classes[key] for key in SOURCE_CLASSES},"diagnostic_summary":{"host_hash_groups":len({hash(urlparse(url).hostname) for url in seen}),"query_candidates":shapes["query"],"signature_candidates":shapes["signed"],"expiry_candidates":shapes["expiry"],"head_results":dict(methods),"range_results":dict(methods),"referer_results":dict(methods)}}
    if ttl:result["ttl_summary"]={"minimum_seconds":min(ttl),"median_seconds":int(median(ttl)),"maximum_seconds":max(ttl)}
    return result
