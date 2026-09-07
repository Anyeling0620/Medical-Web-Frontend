import {createFileRoute} from '@tanstack/react-router'
import homeImage from '../static/home.png'
import {ArrowRight} from "lucide-react";
import {useState} from "react";

export const Route = createFileRoute('/')({component: Home})

function Home() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const handle = (username, password) => {
        if(username === "" || password.length < 8 || username.length > 20) {
            alert("用户名不能为空或超过20个字符\n密码长度不能低于8位")
        } else {
            console.log(username, password)
        }
    }
    return (
        <div className={"w-full h-screen bg-blue-500 flex flex-col justify-center items-center"}>
            <div
                className={"h-[70%] w-[60%] bg-gray-200 border-none rounded-2xl text-center p-16 grid grid-cols-2 gap-4 shadow-2xl"}>
                <div className={"w-full h-full flex flex-col justify-center items-center gap-4"}>
                    <img src={homeImage} alt={"主页"}></img>
                    <h1 className={"text-xl"}>医疗系统管理面板</h1>
                </div>
                <div className={"w-full h-full flex flex-col justify-center items-center gap-6"}>
                    <div className={"flex items-center gap-2 w-full max-w-md"}>
                        {/*<h2 className={"whitespace-nowrap"}>用户名: </h2>*/}
                        <input
                            className={"w-full h-8 px-4 py-2 border-gray-400 border-b focus:outline-none focus:border-indigo-800 transition"}
                            placeholder={"输入管理员账号用户名"} type={"text"} value={username}
                            onChange={(e) => setUsername(e.target.value)}></input>
                    </div>

                    <div className={"flex items-center gap-2 w-full max-w-md"}>
                        {/*<h2 className={"whitespace-nowrap"}>密码:    </h2>*/}
                        <input
                            className={"w-full h-8 px-4 py-2 border-gray-400 border-b focus:outline-none focus:border-indigo-800 transition"}
                            placeholder={"输入管理员账号密码"} type={"password"} value={password}
                            onChange={(e) => setPassword(e.target.value)}></input>
                    </div>

                    <div className={"flex items-center gap-2 w-full max-w-md"}>
                        <button
                            className={"w-full h-full flex flex-col-1 justify-between items-center bg-indigo-600 px-6 py-4"}
                            onClick={() => handle(username, password)}
                        >
                            <p className={"text-white"} >登录</p>
                            <ArrowRight className={"text-white"}></ArrowRight>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    )
}
