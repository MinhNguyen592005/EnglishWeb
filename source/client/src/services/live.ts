import { useEffect, useRef } from 'react'

type Channel='arena'|'classes'
export class LiveUnavailableError extends Error {}
export function useLiveEvents(channel:Channel, id:number|undefined, onChange:()=>void) {
  const callback=useRef(onChange)
  const socketRef=useRef<WebSocket|null>(null),connected=useRef(false)
  const pending=useRef(new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>())
  callback.current=onChange
  useEffect(()=>{
    let stopped=false, socket:WebSocket|null=null, retry:ReturnType<typeof setTimeout>|null=null
    function connect(){
      if(stopped)return
      const url=`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`
      socket=new WebSocket(url,['v12.stomp'])
      socketRef.current=socket
      socket.onopen=()=>socket?.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0')
      socket.onmessage=event=>{
        const frames=String(event.data).split('\0')
        for(const frame of frames){
          if(frame.startsWith('CONNECTED')){connected.current=true;socket?.send(`SUBSCRIBE\nid:${channel}\ndestination:/user/queue/${channel}\nack:auto\n\n\0`);socket?.send('SUBSCRIBE\nid:actions\ndestination:/user/queue/actions\nack:auto\n\n\0')}
          if(frame.startsWith('MESSAGE')){
            const start=frame.indexOf('\n\n')
            if(start<0)continue
            try{const payload=JSON.parse(frame.slice(start+2)) as {roomId?:number;classId?:number;requestId?:string;ok?:boolean;data?:unknown;message?:string};if(payload.requestId){const item=pending.current.get(payload.requestId);if(item){clearTimeout(item.timer);pending.current.delete(payload.requestId);if(payload.ok)item.resolve(payload.data);else item.reject(new Error(payload.message||'Hành động không thành công.'))}}else if(id===undefined||payload[channel==='arena'?'roomId':'classId']===id)callback.current()}catch{/* polling remains active */}
          }
        }
      }
      socket.onclose=()=>{if(socketRef.current===socket){connected.current=false;socketRef.current=null;for(const item of pending.current.values()){clearTimeout(item.timer);item.reject(new Error('Mất kết nối trong lúc gửi hành động. Hãy kiểm tra trạng thái mới nhất.'))}pending.current.clear()}if(!stopped)retry=setTimeout(connect,2000)}
      socket.onerror=()=>socket?.close()
    }
    connect()
    return()=>{stopped=true;connected.current=false;if(retry)clearTimeout(retry);socket?.close()}
  },[channel,id])
  return function sendAction<T>(destination:'/app/arena/action'|'/app/classes/message',body:Record<string,unknown>):Promise<T>{
    const socket=socketRef.current
    if(!connected.current||!socket||socket.readyState!==WebSocket.OPEN)return Promise.reject(new LiveUnavailableError('Kết nối thời gian thực chưa sẵn sàng'))
    const requestId=crypto.randomUUID()
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.current.delete(requestId);reject(new Error('Máy chủ chưa xác nhận hành động. Hãy kiểm tra trạng thái mới nhất.'))},8000)
      pending.current.set(requestId,{resolve:resolve as (value:unknown)=>void,reject,timer})
      try{socket.send(`SEND\ndestination:${destination}\ncontent-type:application/json\n\n${JSON.stringify({...body,requestId})}\0`)}
      catch{clearTimeout(timer);pending.current.delete(requestId);reject(new LiveUnavailableError('Kết nối thời gian thực chưa sẵn sàng'))}
    })
  }
}
