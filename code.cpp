#include <iostream>

using namespace std;


// int main() {
// int m=4;
//top portion 
// for (int i=0;i<=m-1;i++){
//     for(int j=0;j<m-i-1;j++){
//         cout<<' ';
//     }
//     cout<<"*";
//     if(i!=0){
        
//     for(int k=0;k<=2*i-1;k++){
//     cout<<" ";
//     }
//     cout<<"*";
//     }
   
//     cout<<endl;
// }
// //bottom
//     for(int i=0;i<=m-1;i++){
//         for(int j=0;j<i+1;j++){
//             cout<<" ";
//         }
//         cout<<"*";
//         if(i!= m-1){
//         for(int j=0;j<=2*(m-i)-5;j++){
//             cout<<" ";
//         }cout<<"*";}
//         cout<<endl;
//     }

    
//  return 0;
//}
void Conversion(int number){
    int answer=0;
            int power = 1;
        while(number>0){
            int reminder = number%2;
            int number = number/2;
            answer += reminder * power ;
            power*=10;
        }
    cout<<answer;
}
    
int main(){
int number = 10;
Conversion(number);
return 0;
}